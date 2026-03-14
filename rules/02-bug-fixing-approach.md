# Bug Fixing Approach

Follow this exact sequence when fixing a bug. Do NOT skip steps.

## Step 1: Understand the Ticket

- Read the bug title, description, repro steps, and acceptance criteria thoroughly
- Identify what the expected behavior should be vs what is actually happening
- If there are screenshots, analyze them to understand the visual issue
- Note which platform is affected (Android, iOS, or both)

## Step 2: Find the Root Cause

- Search the KMP codebase for the relevant feature/screen code
- Trace the flow from the ViewModel down to the data layer
- Identify the ACTUAL root cause -- not just the symptom
- Do NOT assume the bug is where it appears visually; trace the data flow

## Step 3: Reference Legacy Implementation

- Use the `read_legacy_file` tool to check how the same functionality works in the legacy apps
- For Android bugs, check the Android legacy codebase for the equivalent screen/feature
- For iOS bugs, check the iOS legacy codebase
- Understand the EXPECTED BEHAVIOR from legacy -- not the implementation details
- The legacy code shows you what the correct result should be; the KMP implementation should achieve the same result using KMP architecture

## Step 4: Fix the Root Cause

- Fix the ACTUAL root cause, not just the symptom
- Do NOT apply workarounds, hacks, or band-aid fixes
- Follow the existing Clean Architecture pattern:
  - If the bug is in data mapping → fix the Mapper
  - If the bug is in business logic → fix the UseCase
  - If the bug is in state management → fix the ViewModel
  - If the bug is in the API response handling → fix the Repository/DTO
  - If the bug is in platform UI → fix the Compose screen or SwiftUI view
- Keep changes minimal and focused on the bug
- Do NOT refactor unrelated code

## Step 5: Verify by Dry Run

Before finishing, mentally walk through your changes:

1. Trace the data flow from the entry point through your changes to the UI
2. Verify that the fix handles edge cases (null values, empty lists, error states)
3. Confirm the fix does not break other parts of the same feature
4. Check that both Android and iOS are considered (if the fix is in shared code)
5. Verify that the fix matches what the legacy app does functionally

In your final summary, include:
- What the root cause was
- What you changed and why
- How the fix aligns with the legacy behavior
- Any edge cases you considered
