# Coding Standards

## General

- Follow existing code patterns in the project -- do not introduce new patterns
- Do not add unnecessary comments explaining what the code does
- Do not change existing branch names or git configuration
- Do not update API specs -- those are managed by the solution architect
- Preserve the exact indentation style used in the file you are editing

## Kotlin (Shared / Android)

- Use Kotlin idioms: `let`, `apply`, `also`, `takeIf`, `when` expressions
- Prefer immutable (`val`) over mutable (`var`)
- Use data classes for state and models
- Use sealed classes/interfaces for representing UI states
- Null safety: use `?.`, `?:`, `let {}` -- never force-unwrap (`!!`) unless absolutely necessary
- Use Kotlin coroutines and Flow for async operations
- Follow the existing Koin DI pattern for dependency injection

## Swift (iOS)

- Use SwiftUI patterns as already established in the iosApp
- Use `@ObservedObject`, `@StateObject`, `@Published` correctly
- Use guard-let for early returns instead of nested if-let
- Use Swift naming conventions (camelCase for functions/variables, PascalCase for types)

## Jetpack Compose (Android)

- Use Compose patterns as already established in the androidApp
- Use `collectAsState()` for observing ViewModel state
- Follow the existing screen composition pattern (Scaffold, Column, etc.)

## Architecture Rules

- Never put business logic in ViewModels -- use UseCases
- Never access network/database directly from ViewModels -- go through Repository
- Domain models must NOT contain DTO annotations or network-specific fields
- Mappers are the only place where DTO-to-domain conversion happens
- Repository interfaces live in domain layer, implementations in data layer
