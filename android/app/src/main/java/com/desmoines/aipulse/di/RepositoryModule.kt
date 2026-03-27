package com.desmoines.aipulse.di

import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.EventsRepositoryImpl
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Hilt module for binding repository interfaces to their implementations.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    abstract fun bindEventsRepository(impl: EventsRepositoryImpl): EventsRepository

    @Binds
    abstract fun bindRestaurantsRepository(impl: RestaurantsRepositoryImpl): RestaurantsRepository
}
