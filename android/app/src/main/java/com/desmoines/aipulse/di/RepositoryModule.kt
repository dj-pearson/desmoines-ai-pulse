package com.desmoines.aipulse.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Hilt module for binding repository interfaces to their implementations.
 * Repository bindings will be added as data layers are built (AND-007+).
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule
