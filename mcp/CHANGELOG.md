# Changelog

All notable changes to `ferrtrack-mcp` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [10.18.0] - 2026-11-28

### Features

- feat(mcp): add get_issue_metadata and set_issue_metadata (#66)

## [10.17.0] - 2026-11-27

### Features

- feat(mcp): add issue dependency tools (#64)

## [10.16.1] - 2026-11-24

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.17.1 (#60)

## [10.16.0] - 2026-11-23

### Features

- feat(mcp): report total in list_track_issues from X-Total-Count (#59)

## [10.15.1] - 2026-11-23

### Bug Fixes

- fix(mcp): detect the last list_track_issues page exactly at limit=200 (#58)

## [10.15.0] - 2026-11-20

### Features

- feat(mcp): add delete_issue and explain delete_issue_comment errors (#54)

## [10.14.2] - 2026-11-20

### Bug Fixes

- fix(mcp): page list_track_issues, default to open issues, return compact rows (#52)

## [10.14.1] - 2026-11-18

### Bug Fixes

- fix(mcp): accept connected-app org tokens at the bearer gate (#51)

## [10.14.0] - 2026-11-15

### Features

- feat(mcp): let issue tools set cycle, milestone, priority and estimate (#47)

## [10.13.11] - 2026-11-13

### Bug Fixes

- fix(mcp): emit lcov coverage for all source files (#42)

## [10.13.10] - 2026-11-13

### Bug Fixes

- fix(mcp): request the FerrTrack scopes when authorizing (#39)

## [10.13.9] - 2026-11-12

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.15.0 (#41)

## [10.13.8] - 2026-11-10

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.14.5 (#38)

## [10.13.7] - 2026-11-10

### Refactoring

- refactor: apply sonar quick wins (#36)

## [10.13.6] - 2026-11-01

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.14.4 (#29)

## [10.13.5] - 2026-10-31

### Bug Fixes

- fix(ci): only tag latest on release and pin the node base image digest (#27)

## [10.13.4] - 2026-10-27

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.14.3 (#20)

## [10.13.3] - 2026-10-26

### Bug Fixes

- fix(deps): override body-parser and fast-uri to patched versions (#21)
- fix(mcp): align cycle and milestone tools with the api contract (#16)
- fix(mcp): annotate destructive and read-only tools (#17)

## [10.13.2] - 2026-10-21

### Bug Fixes

- fix(deps): update dependency @ferrlabs/mcp-core to ^10.14.0 (#9)

## [10.13.1] - 2026-10-17

### Bug Fixes

- fix(mcp): release to validate the npm trusted publisher (#1)
