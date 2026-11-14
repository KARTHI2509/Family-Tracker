/**
 * Automated Test Suite for FamilyTracker
 * Tests all 18 REST endpoints, family privacy boundaries, and Socket.IO real-time events.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Set test environment
const TEST_PORT = 3099;
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = 'test_secret_key_familytracker_automated_tests_12345';
const TEST_DB_PATH = path.resolve(__dirname, 'test_familytracker.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';

// Remove any existing test database
if (fs.existsSync(TEST_DB_PATH)) {
  try { fs.unlinkSync(TEST_DB_PATH); } catch {}
}

const { app, server, io } = require('../src/server');
const { io: ClientSocket } = require('socket.io-client');

const results = [];

function recordTest(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${statusStr} - ${name} ${detail ? '(' + detail + ')' : ''}`);
}

async function request(method, path, body = null, token = null) {
  const url = `http://localhost:${TEST_PORT}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const status = res.status;
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status, data };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n==================================================');
  console.log('🚀 Running FamilyTracker Automated Test Suite');
  console.log('==================================================\n');

  try {
    // 1. Health check
    const health = await request('GET', '/api/health');
    recordTest('Health Check Endpoint', health.status === 200 && health.data?.status === 'ok');

    // 2. Register User 1 (Alice)
    const regAlice = await request('POST', '/api/auth/register', {
      name: 'Alice Smith',
      email: 'alice@example.com',
      password: 'password123',
      phone: '111-222-3333'
    });
    recordTest('1. Register User 1 (Alice)', regAlice.status === 201 && !!regAlice.data?.token);
    const tokenAlice = regAlice.data?.token;
    const aliceId = regAlice.data?.user?.id;

    // 3. Register User 2 (Bob)
    const regBob = await request('POST', '/api/auth/register', {
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'password123'
    });
    recordTest('Register User 2 (Bob)', regBob.status === 201 && !!regBob.data?.token);
    const tokenBob = regBob.data?.token;
    const bobId = regBob.data?.user?.id;

    // 4. Duplicate registration prevention
    const regDup = await request('POST', '/api/auth/register', {
      name: 'Alice Clone',
      email: 'alice@example.com',
      password: 'password123'
    });
    recordTest('Duplicate Email Rejection', regDup.status === 409);

    // 5. Login User (Alice)
    const loginAlice = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'password123'
    });
    recordTest('2. Login User', loginAlice.status === 200 && loginAlice.data?.user?.email === 'alice@example.com');

    // 6. Get Current User profile
    const meAlice = await request('GET', '/api/auth/me', null, tokenAlice);
    recordTest('3. Get Current User Profile', meAlice.status === 200 && meAlice.data?.user?.id === aliceId);

    // 7. Create Family (Smith Family)
    const createFam = await request('POST', '/api/family/create', { name: 'Smith Family' }, tokenAlice);
    recordTest('4. Create Family', createFam.status === 201 && !!createFam.data?.invite_code);
    const inviteCode = createFam.data?.invite_code;
    const familyId = createFam.data?.family?.id;

    // 8. Retrieve Family Invite Code
    const codeRes = await request('GET', '/api/family/invite-code', null, tokenAlice);
    recordTest('7. Generate / Retrieve Invite Code', codeRes.status === 200 && codeRes.data?.invite_code === inviteCode);

    // 9. Join Family (Bob joins Smith Family)
    const joinBob = await request('POST', '/api/family/join', { inviteCode }, tokenBob);
    recordTest('5. Join Family using Invite Code', joinBob.status === 200 && joinBob.data?.family?.id === familyId);

    // 10. Retrieve Family Members
    const membersRes = await request('GET', '/api/family/members', null, tokenAlice);
    recordTest('6. Retrieve Family Members', membersRes.status === 200 && membersRes.data?.members?.length === 2);

    // 11. Create Second Family (Johnson Family for privacy boundary tests)
    const regCharlie = await request('POST', '/api/auth/register', {
      name: 'Charlie Johnson',
      email: 'charlie@example.com',
      password: 'password123'
    });
    const tokenCharlie = regCharlie.data?.token;
    const createFam2 = await request('POST', '/api/family/create', { name: 'Johnson Family' }, tokenCharlie);
    const family2Id = createFam2.data?.family?.id;
    recordTest('Create Separate Family (Privacy Isolation)', createFam2.status === 201 && family2Id !== familyId);

    // 12. Update Location (Alice)
    const locAlice = await request('POST', '/api/location/update', {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
      speed: 25.5,
      battery_level: 82,
      is_charging: 1,
      address: 'San Francisco, CA'
    }, tokenAlice);
    recordTest('8. Update GPS Location', locAlice.status === 200 && locAlice.data?.location?.latitude === 37.7749);

    // 13. Retrieve Latest Locations
    const latestLocs = await request('GET', '/api/location/latest', null, tokenAlice);
    recordTest('9. Retrieve Latest Locations', latestLocs.status === 200 && latestLocs.data?.locations?.length >= 1);

    // 14. Retrieve Location History
    const historyAlice = await request('GET', `/api/location/history/${aliceId}`, null, tokenAlice);
    recordTest('10. Retrieve Location History (Agreement check)',
      historyAlice.status === 200 &&
      Array.isArray(historyAlice.data?.history) &&
      Array.isArray(historyAlice.data?.locations)
    );

    // 15. Privacy Boundary: Charlie cannot view Alice's location history
    const crossHistory = await request('GET', `/api/location/history/${aliceId}`, null, tokenCharlie);
    recordTest('Family Isolation: Cross-Family History Forbidden', crossHistory.status === 403);

    // 16. Create Safe Zone / Geofence
    const createGf = await request('POST', '/api/geofence/create', {
      name: 'Home Zone',
      latitude: 37.7750,
      longitude: -122.4195,
      radius: 300,
      color: '#4F46E5'
    }, tokenAlice);
    recordTest('11. Create Geofence / Safe Zone', createGf.status === 201 && !!createGf.data?.geofence?.id);
    const geofenceId = createGf.data?.geofence?.id;

    // 17. List Geofences
    const listGf = await request('GET', '/api/geofence/list', null, tokenAlice);
    recordTest('12. List Geofences', listGf.status === 200 && listGf.data?.geofences?.length >= 1);

    // 18. Family Isolation: Charlie cannot delete Alice's geofence
    const crossDeleteGf = await request('DELETE', `/api/geofence/${geofenceId}`, null, tokenCharlie);
    recordTest('Family Isolation: Cross-Family Geofence Deletion Forbidden', crossDeleteGf.status === 403);

    // 19. Delete Geofence
    const delGf = await request('DELETE', `/api/geofence/${geofenceId}`, null, tokenAlice);
    recordTest('13. Delete Geofence', delGf.status === 200);

    // 20. Trigger SOS with Coordinates
    const sosTrigger = await request('POST', '/api/sos/trigger', {
      latitude: 37.7749,
      longitude: -122.4194
    }, tokenAlice);
    recordTest('14. Trigger SOS Emergency', sosTrigger.status === 201 && sosTrigger.data?.sos?.is_active === 1);

    // 21. Retrieve Active SOS Events
    const activeSOSRes = await request('GET', '/api/sos/active', null, tokenAlice);
    recordTest('Retrieve Active SOS for Dashboard', activeSOSRes.status === 200 && activeSOSRes.data?.activeSOSEvents?.length >= 1);

    // 22. Cancel SOS
    const sosCancel = await request('POST', '/api/sos/cancel', null, tokenAlice);
    recordTest('15. Cancel SOS Emergency', sosCancel.status === 200);

    // 23. Trigger SOS without coordinates (GPS permission denied scenario)
    const sosNoCoords = await request('POST', '/api/sos/trigger', {
      latitude: null,
      longitude: null
    }, tokenAlice);
    recordTest('Trigger SOS without Coordinates (GPS Denied)', sosNoCoords.status === 201 && sosNoCoords.data?.sos?.latitude === null);
    await request('POST', '/api/sos/cancel', null, tokenAlice);

    // 24. Retrieve Alerts
    const alertsRes = await request('GET', '/api/alerts', null, tokenAlice);
    recordTest('16. Retrieve Safety Alerts', alertsRes.status === 200 && Array.isArray(alertsRes.data?.alerts));
    const firstAlertId = alertsRes.data?.alerts?.[0]?.id;

    // 25. Mark single alert as read
    if (firstAlertId) {
      const readOne = await request('PUT', `/api/alerts/${firstAlertId}/read`, null, tokenAlice);
      recordTest('17. Mark Alert as Read', readOne.status === 200);
    }

    // 26. Mark all alerts as read
    const readAll = await request('PUT', '/api/alerts/read-all', null, tokenAlice);
    recordTest('18. Mark All Alerts as Read', readAll.status === 200);

    // ----------------------------------------------------
    // SOCKET.IO REAL-TIME EVENT TESTS
    // ----------------------------------------------------
    console.log('\n--- Testing Socket.IO Real-Time Engine ---');

    // Socket Test 1: Unauthenticated connection rejected
    const unauthSocket = ClientSocket(`http://localhost:${TEST_PORT}`, {
      auth: { token: '' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false
    });

    const unauthRejected = await new Promise(resolve => {
      unauthSocket.on('connect_error', (err) => {
        resolve(err.message.includes('Authentication'));
      });
      unauthSocket.on('connect', () => resolve(false));
      setTimeout(() => resolve(false), 2000);
    });
    recordTest('Socket.IO: Unauthenticated Connection Rejection', unauthRejected);
    unauthSocket.disconnect();

    // Socket Test 2: Alice and Bob connect authenticated
    const socketAlice = ClientSocket(`http://localhost:${TEST_PORT}`, {
      auth: { token: tokenAlice },
      transports: ['websocket'],
      reconnection: false
    });

    const socketBob = ClientSocket(`http://localhost:${TEST_PORT}`, {
      auth: { token: tokenBob },
      transports: ['websocket'],
      reconnection: false
    });

    const socketsConnected = await new Promise(resolve => {
      let aConnected = false;
      let bConnected = false;
      socketAlice.on('connect', () => {
        aConnected = true;
        if (aConnected && bConnected) resolve(true);
      });
      socketBob.on('connect', () => {
        bConnected = true;
        if (aConnected && bConnected) resolve(true);
      });
      setTimeout(() => resolve(aConnected && bConnected), 3000);
    });
    recordTest('Socket.IO: Authenticated Connections (Alice & Bob)', socketsConnected);

    // Socket Test 3: Location broadcast from Alice to Bob
    const locationBroadcastPromise = new Promise(resolve => {
      socketBob.on('location:update', (data) => {
        const validSender = (data.userId === aliceId || data.user_id === aliceId);
        const validLat = data.latitude === 37.8000;
        resolve(validSender && validLat);
      });
      setTimeout(() => resolve(false), 3000);
    });

    await request('POST', '/api/location/update', {
      latitude: 37.8000,
      longitude: -122.4000,
      accuracy: 8,
      speed: 15
    }, tokenAlice);

    const locationReceived = await locationBroadcastPromise;
    recordTest('Socket.IO: Location Broadcast to Family Member', locationReceived);

    // Socket Test 4: SOS broadcast from Bob to Alice
    const sosBroadcastPromise = new Promise(resolve => {
      socketAlice.on('sos:triggered', (data) => {
        const validSender = (data.userId === bobId || data.user_id === bobId);
        resolve(validSender);
      });
      setTimeout(() => resolve(false), 3000);
    });

    await request('POST', '/api/sos/trigger', {
      latitude: 37.7700,
      longitude: -122.4200
    }, tokenBob);

    const sosReceived = await sosBroadcastPromise;
    recordTest('Socket.IO: Emergency SOS Broadcast', sosReceived);
    await request('POST', '/api/sos/cancel', null, tokenBob);

    // Socket Test 5: Multi-device handling
    // Connect Alice on a second device
    const socketAliceDevice2 = ClientSocket(`http://localhost:${TEST_PORT}`, {
      auth: { token: tokenAlice },
      transports: ['websocket'],
      reconnection: false
    });

    await new Promise(resolve => socketAliceDevice2.on('connect', resolve));

    let offlineEmittedprematurely = false;
    socketBob.on('member:offline', (data) => {
      if (data.userId === aliceId || data.user_id === aliceId) {
        offlineEmittedprematurely = true;
      }
    });

    // Disconnect Device 1 only
    socketAlice.disconnect();
    await sleep(600);

    recordTest('Socket.IO: Multi-Device (User stays online if second device is open)', !offlineEmittedprematurely);

    // Now disconnect Device 2 as well
    const offlineEventPromise = new Promise(resolve => {
      socketBob.on('member:offline', (data) => {
        if (data.userId === aliceId || data.user_id === aliceId) {
          resolve(true);
        }
      });
      setTimeout(() => resolve(false), 3000);
    });

    socketAliceDevice2.disconnect();
    const offlineReceived = await offlineEventPromise;
    recordTest('Socket.IO: User marked offline when ALL devices disconnect', offlineReceived);

    // Socket Test 6: Family Isolation (Charlie from Family 2 does NOT receive Smith Family events)
    const socketCharlie = ClientSocket(`http://localhost:${TEST_PORT}`, {
      auth: { token: tokenCharlie },
      transports: ['websocket'],
      reconnection: false
    });
    await new Promise(resolve => socketCharlie.on('connect', resolve));

    let charlieLeakedEvent = false;
    socketCharlie.on('location:update', () => { charlieLeakedEvent = true; });
    socketCharlie.on('sos:triggered', () => { charlieLeakedEvent = true; });

    // Bob triggers SOS in Family 1
    await request('POST', '/api/sos/trigger', { latitude: null, longitude: null }, tokenBob);
    await sleep(600);
    recordTest('Socket.IO: Family Privacy Isolation (No cross-family event leakage)', !charlieLeakedEvent);
    await request('POST', '/api/sos/cancel', null, tokenBob);

    // Cleanup sockets
    socketBob.disconnect();
    socketCharlie.disconnect();

    console.log('\n--- Testing V2 Journeys & Super Admin Security ---');

    // V2 Test 1: Start Journey
    const startJourney = await request('POST', '/api/journey/start', {
      destinationName: 'Central Library',
      destinationLat: 37.7800,
      destinationLng: -122.4200,
      estimatedDurationMin: 25,
      startLat: 37.7749,
      startLng: -122.4194
    }, tokenAlice);
    recordTest('V2: Start Tracked Journey', startJourney.status === 201 && startJourney.data?.journey?.destination_name === 'Central Library');
    const journeyId = startJourney.data?.journey?.id;

    // V2 Test 2: Active Journeys Query
    const activeJourneys = await request('GET', '/api/journey/active', null, tokenBob);
    recordTest('V2: Family Active Journeys Query', activeJourneys.status === 200 && activeJourneys.data?.journeys?.length > 0);

    // V2 Test 3: Emergency Check-In ("Please check on me")
    const checkin = await request('POST', '/api/journey/checkin', { message: 'Please check on me' }, tokenAlice);
    recordTest('V2: Emergency Check-In Broadcast', checkin.status === 200 && checkin.data?.alert?.type === 'emergency_checkin');

    // V2 Test 4: Safe Arrival Confirmation
    const arrival = await request('POST', '/api/journey/arrival', { journeyId }, tokenAlice);
    recordTest('V2: Safe Arrival Confirmation', arrival.status === 200 && arrival.data?.journey?.status === 'completed');

    // V2 Test 5: Role Security - Non-Admin Forbidden
    const forbiddenAdmin = await request('GET', '/api/admin/stats', null, tokenAlice);
    recordTest('V2 Security: Non-Admin Forbidden from /api/admin (403)', forbiddenAdmin.status === 403);

    // V2 Test 6: Super Admin Provisioning & Access
    const db = require('../src/config/database');
    const bcrypt = require('bcryptjs');
    const adminPassHash = bcrypt.hashSync('AdminPass123!', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, role, status, avatar_color)
      VALUES ('Super Admin', 'admin@example.com', ?, 'super_admin', 'active', '#DC2626')
    `).run(adminPassHash);

    const adminLogin = await request('POST', '/api/auth/login', {
      email: 'admin@example.com',
      password: 'AdminPass123!'
    });
    recordTest('V2: Super Admin Login', adminLogin.status === 200 && adminLogin.data?.user?.role === 'super_admin');
    const tokenAdmin = adminLogin.data?.token;

    // V2 Test 7: Super Admin Stats
    const adminStats = await request('GET', '/api/admin/stats', null, tokenAdmin);
    recordTest('V2: Super Admin Stats & Telemetry', adminStats.status === 200 && adminStats.data?.stats?.totalUsers >= 3);

    // V2 Test 8: Super Admin User Search & Filter
    const userSearch = await request('GET', '/api/admin/users?search=Alice', null, tokenAdmin);
    recordTest('V2: Admin User Search & Filter', userSearch.status === 200 && userSearch.data?.users?.[0]?.name === 'Alice Smith');

    // V2 Test 9: Suspend User Account
    const suspendRes = await request('PUT', `/api/admin/users/${aliceId}/status`, {
      status: 'suspended',
      reason: 'Automated test suspension'
    }, tokenAdmin);
    recordTest('V2: Suspend User Account', suspendRes.status === 200 && suspendRes.data?.status === 'suspended');

    // V2 Test 10: Suspended User Rejected from Login
    const suspendedLogin = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'password123'
    });
    recordTest('V2 Security: Suspended User Blocked from Login (403)', suspendedLogin.status === 403);

    // V2 Test 11: Reactivate User Account
    const activateRes = await request('PUT', `/api/admin/users/${aliceId}/status`, {
      status: 'active',
      reason: 'Reactivated after test'
    }, tokenAdmin);
    recordTest('V2: Reactivate User Account', activateRes.status === 200 && activateRes.data?.status === 'active');

    // V2 Test 12: Emergency Location Access Override Workflow
    const emergencyAccess = await request('POST', '/api/admin/emergency-access', {
      targetUserId: aliceId,
      caseType: 'missing_person',
      justification: 'Critical search and rescue coordination for missing family member'
    }, tokenAdmin);
    recordTest('V2: Emergency Location Access Override with Justification', emergencyAccess.status === 200 && !!emergencyAccess.data?.grantId);

    // V2 Test 13: Query Immutable Audit Logs
    const auditQuery = await request('GET', '/api/admin/audit-logs', null, tokenAdmin);
    recordTest('V2: Query Immutable Security Audit Trail', auditQuery.status === 200 && auditQuery.data?.total > 0);

    // V2 Test 14: Automated 7-Day Location Retention
    const locationService = require('../src/services/locationService');
    const purgedCount = locationService.cleanupExpiredLocations(7);
    recordTest('V2: 7-Day Location Retention Scheduled Purge', typeof purgedCount === 'number');

    // ==================================================
    // V3 Tests: Complete Family Management & Switch Family
    // ==================================================

    // V3 Test 1: GET /api/family/details for Alice
    const aliceFamilyDetails = await request('GET', '/api/family/details', null, tokenAlice);
    recordTest('V3: GET /api/family/details', aliceFamilyDetails.status === 200 && aliceFamilyDetails.data?.userRole === 'owner');

    // V3 Test 2: POST /api/family/validate-code with invalid code (404)
    const badCodeValidate = await request('POST', '/api/family/validate-code', { inviteCode: 'NONEXIST' }, tokenBob);
    recordTest('V3: Validate Code rejects non-existent family (404)', badCodeValidate.status === 404);

    // V3 Test 3: POST /api/family/validate-code with own family code (400)
    const ownCodeValidate = await request('POST', '/api/family/validate-code', { inviteCode: aliceFamilyDetails.data?.family?.invite_code }, tokenBob);
    recordTest('V3: Validate Code rejects already joined family (400)', ownCodeValidate.status === 400);

    // V3 Test 4: Register Evelyn & Create Second Family ("Evelyn Circle")
    const regEvelyn = await request('POST', '/api/auth/register', {
      name: 'Evelyn Brown',
      email: 'evelyn@example.com',
      password: 'password123'
    });
    const tokenEvelyn = regEvelyn.data?.token;
    const evelynId = regEvelyn.data?.user?.id;

    const createFamily2 = await request('POST', '/api/family/create', { name: 'Evelyn Circle' }, tokenEvelyn);
    const evelynInviteCode = createFamily2.data?.invite_code;
    const evelynFamilyId = createFamily2.data?.family?.id;
    recordTest('V3: Register User (Evelyn) & Create Family 2', createFamily2.status === 201 && !!evelynInviteCode);

    // V3 Test 5: Validate Evelyn's invite code from Bob
    const evelynCodeValidate = await request('POST', '/api/family/validate-code', { inviteCode: evelynInviteCode }, tokenBob);
    recordTest('V3: Validate Target Family Code Preview', evelynCodeValidate.status === 200 && evelynCodeValidate.data?.familyName === 'Evelyn Circle');

    // V3 Test 6: Secure Atomic Switch of Bob from Alice's Family to Evelyn's Family
    const switchBob = await request('POST', '/api/family/switch', { inviteCode: evelynInviteCode }, tokenBob);
    recordTest('V3: POST /api/family/switch executes atomically', switchBob.status === 200 && switchBob.data?.family?.id === evelynFamilyId);

    // V3 Test 7: Verify Bob is removed from Alice's Family roster and present in Evelyn's
    const aliceMembersAfter = await request('GET', '/api/family/members', null, tokenAlice);
    const evelynMembersAfter = await request('GET', '/api/family/members', null, tokenEvelyn);
    const bobInAlice = (aliceMembersAfter.data?.members || []).some(m => m.id === bobId);
    const bobInEvelyn = (evelynMembersAfter.data?.members || []).some(m => m.id === bobId);
    recordTest('V3: Member roster updated immediately in both families', !bobInAlice && bobInEvelyn);

    // V3 Test 8: Cross-Family Privacy & Location Isolation
    // Post new location for Bob while he is in Evelyn's family
    await request('POST', '/api/location/update', {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 10,
      batteryLevel: 95
    }, tokenBob);

    // Alice (in old family) queries latest locations and history of Bob
    const aliceLatestLocs = await request('GET', '/api/location/latest', null, tokenAlice);
    const aliceHistoryBob = await request('GET', `/api/location/history/${bobId}`, null, tokenAlice);
    const bobVisibleToAlice = (aliceLatestLocs.data?.locations || []).some(l => l.user_id === bobId);
    recordTest('V3 Security: Absolute Cross-Family Location Isolation (Old Family cannot see Bob)', !bobVisibleToAlice && (aliceHistoryBob.status === 403 || (aliceHistoryBob.data?.history || []).length === 0));

    // V3 Test 9: Owner Succession during Switch
    // Register Dave into Alice's family
    const regDave = await request('POST', '/api/auth/register', {
      name: 'Dave Miller',
      email: 'dave@example.com',
      password: 'password123'
    });
    const tokenDave = regDave.data?.token;
    const daveId = regDave.data?.user?.id;
    await request('POST', '/api/family/join', { inviteCode: aliceFamilyDetails.data?.family?.invite_code }, tokenDave);

    // Alice (Owner) switches to Evelyn's family, passing Dave as successor
    const aliceSwitch = await request('POST', '/api/family/switch', {
      inviteCode: evelynInviteCode,
      transferOwnerTo: daveId
    }, tokenAlice);
    recordTest('V3: Family Owner switches with atomic Owner Succession', aliceSwitch.status === 200);

    // Check that Dave is now the recognized Owner of Alice's old family
    const daveDetails = await request('GET', '/api/family/details', null, tokenDave);
    recordTest('V3: Successor (Dave) promoted to Family Owner', daveDetails.status === 200 && daveDetails.data?.userRole === 'owner');

    // V3 Test 10: Leave Family
    const daveLeave = await request('POST', '/api/family/leave', {}, tokenDave);
    recordTest('V3: POST /api/family/leave', daveLeave.status === 200);

    const daveMe = await request('GET', '/api/auth/me', null, tokenDave);
    recordTest('V3: User family_id cleared after leaving family', daveMe.data?.user?.family_id === null || daveMe.data?.user?.family_id === undefined);

  } catch (err) {
    console.error('Fatal test error:', err);
    recordTest('Test Runner Execution', false, err.message);
  } finally {
    // Close server
    server.close();
    // Clean up test DB
    try {
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
      if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
      if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
    } catch {}

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    console.log('\n==================================================');
    console.log(`📊 Test Results: ${passed}/${total} Passed (${failed} Failed)`);
    console.log('==================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

server.listen(TEST_PORT, () => {
  runTests();
});

