# GaGa Today 2.8.1

Today now prioritizes a compact header, readable summary tiles, focused creation actions and the real due/overdue agenda. Secondary finance/category tools and the China Direct preview are expandable; the preview remains explicitly non-live. Tasks/reminders can be completed through the existing server save flow. Agenda rows open their existing editor. Historical events stay in Events history; future events do not duplicate today's agenda.

Loading and failed requests are distinct from a successful empty day. A failed mutation does not optimistically remove a pending record. The ViewModel, account identity, backend configuration, record ownership and reminder scheduling are retained.

## Validation

- Release APK/AAB and existing regression suites passed: run 38534919509, 96 JUnit tests, zero failures/errors/skips.
- Five native checks of the production Today composable passed: run 38534919437. Covered populated light, enlarged-text dark, empty, loading and error states, plus completion callback, secondary-action navigation and tool expansion.
- Native captures use test-only records, not live account data. Checks used a 360dp Android 10 emulator and text scale up to 1.4. The surrounding app navigation and physical-device flows remain outside these captures.
- Compiled PR merge: a300d9f83aa76bb53c17fb8504378831d0eebdd0; branch head: 3ef3cccc00cb55dbee04e75171081e5b6f1e055a.
- APK/AAB signed with the retained approved certificate, package gagachat.app, version 2.8.1/code56. Subsequent release metadata/documentation commits do not alter Android source.
