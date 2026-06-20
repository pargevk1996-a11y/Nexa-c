package com.nexa.messenger;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // FLAG_SECURE: prevents screenshots and screen recording at the OS level.
        // The app will appear as a black rectangle in the recent-apps switcher,
        // in any screen recorder, and when the user presses Power+Volume Down.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
