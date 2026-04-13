# License Guidance

Use this matrix as a first-pass risk screen, not as legal advice. When a dependency is business-critical or licensing is ambiguous, recommend legal review.

## Compatibility matrix

| License | Proprietary-friendly | Copyleft strength | Default note |
| --- | --- | --- | --- |
| MIT | Yes | None | Include the license text |
| Apache-2.0 | Yes | None | Include license and NOTICE when required |
| BSD-2-Clause | Yes | None | Include the license text |
| BSD-3-Clause | Yes | None | Include the license text; no endorsement |
| ISC | Yes | None | Include the license text |
| MPL-2.0 | Usually | Weak | File-level copyleft; review modification scope |
| LGPL-2.1 / LGPL-3.0 | Conditional | Weak | Dynamic linking is usually safer than static linking |
| GPL-2.0 / GPL-3.0 | Usually no | Strong | Flag for proprietary or closed-source distribution |
| AGPL-3.0 | Usually no | Strong | Network use can trigger source-sharing obligations |
| SSPL | Usually no | Strong | Treat as incompatible unless policy says otherwise |
| Unlicense | Yes | None | Keep attribution requirements in mind if policy requires them |
| Unknown / missing | No | Unknown | Treat as high risk until clarified |

## Default rules

1. Flag strong copyleft licenses as `Critical` when the project is proprietary, closed-source, or otherwise incompatible with source-sharing obligations.
2. Flag weak copyleft licenses as `Medium` until the usage pattern is reviewed.
3. Flag unknown or missing license metadata as `High`.
4. Flag license changes between current and target versions even when the version bump looks routine.

## How to reason about project policy

- If the repository license is GPL or AGPL, strong copyleft dependencies may be acceptable.
- If the repository license is MIT, Apache, BSD, private, or not present, treat strong copyleft as a likely blocker.
- If there is no `LICENSE` file, say the project license posture is undefined and avoid claiming compatibility.

## Reporting guidance

When you report a license issue, include:

- package name
- current version and target version if relevant
- reported license string
- why it is risky in this repo
- whether the risk is policy, legal ambiguity, or a tooling gap
