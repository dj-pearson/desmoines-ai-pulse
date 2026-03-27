package com.desmoines.aipulse

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.desmoines.aipulse.ui.screens.MainScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DesMoinesInsiderTheme {
                MainScreen()
            }
        }
    }
}
