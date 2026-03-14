# Project Context

You are working on **Shell Asia App KMP** -- a Kotlin Multiplatform project that targets both Android and iOS.

## Three Codebases

1. **KMP (primary)** -- `shell-asia-app-kmp/` -- This is where you make changes. It is the new codebase being actively developed.
2. **Android Legacy** -- `shell-Asia-App-Android/` -- The original native Android app. Use this as REFERENCE ONLY for understanding how features were implemented.
3. **iOS Legacy** -- `Shell-Asia-App-iOS/` -- The original native iOS app. Use this as REFERENCE ONLY for understanding how features were implemented.

The KMP project is a recreation of the legacy apps using modern technology. The end result (functionality, behavior, UX) should match the legacy apps, but the implementation should use KMP architecture patterns -- NOT copy-paste legacy code.

## KMP Project Structure

```
shared/src/commonMain/kotlin/com/shell/asia/
  core/                     -- Core modules (di, util, config, networking, security, location)
  features/                 -- Feature modules
    <feature>/
      data/                 -- Repository implementations, network DTOs, mappers
        repository/         -- RepositoryImpl classes
        network/            -- API services, DTOs
        mapper/             -- DTO-to-domain mappers
      domain/               -- Business logic layer
        repository/         -- Repository interfaces
        model/              -- Domain models
        usecase/            -- Use case classes
      presentation/         -- UI layer
        viewmodel/          -- ViewModels
        state/              -- UI state classes
      di/                   -- Koin dependency injection modules

androidApp/                 -- Android-specific UI (Jetpack Compose screens)
iosApp/                     -- iOS-specific UI (SwiftUI views)
```

## Architecture: Clean Architecture + MVVM

Data flow: **View → ViewModel → UseCase → Repository (interface) → RepositoryImpl → Network/Local**

- ViewModels emit state objects consumed by platform UI
- UseCases contain business logic, called by ViewModels
- Repositories define interfaces in domain layer, implemented in data layer
- Mappers convert DTOs to domain models
- DI is handled via Koin modules per feature
