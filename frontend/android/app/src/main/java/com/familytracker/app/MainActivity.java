package com.familytracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FamilyLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
