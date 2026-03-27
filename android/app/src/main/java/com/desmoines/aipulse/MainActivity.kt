package com.desmoines.aipulse

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.desmoines.aipulse.ui.screens.MainScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.util.NetworkMonitor
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DesMoinesInsiderTheme {
                MainScreen(networkMonitor = networkMonitor)
            }
        }
    }
}
