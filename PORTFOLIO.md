# Portfolio notes

## Project

**QC Checker — AI-assisted construction report quality control**  
Cardiff University Applied Software Engineering group project, 2026

QC Checker is a full-stack MERN application that analyses construction quality-control PDFs, detects structured and formatting issues, produces annotated feedback, and presents role-specific operational analytics.

## Verified contribution evidence

The original private GitLab repository records 58 commits authored by Tiago Moico across two university email variants. This made Tiago the project's second-largest contributor by commit count.

Representative areas visible in the history include:

| Area | Engineering contribution |
| --- | --- |
| Analytics | Extracted shared analytics logic; built team-member comparison; kept time filters and comparisons synchronised |
| Reliability | Added automated report-file retention and cleanup tests; fixed failing backend suites |
| Testing | Expanded frontend and backend coverage for reports, profiles, administration, teams, and comparison workflows |
| UX and accessibility | Added the public onboarding/help experience, improved accessibility, and refined navigation |
| Report workflow | Improved annotated-PDF guidance and the time-saved calculation |
| Documentation | Produced the final setup, API, feature, security, and testing documentation |

## CV-ready description

> Co-developed QC Checker, a MERN application for automated construction report quality control. Built team analytics and comparison workflows, implemented scheduled report-file retention, expanded Jest/Vitest coverage, improved accessibility and onboarding, and contributed 58 commits within a five-person Agile team.

## Suggested interview talking points

- Why analytics logic was extracted into a shared service instead of duplicated across routes.
- How time-range filters and member comparisons were kept consistent across client and server state.
- Why uploaded reports require both database retention metadata and filesystem cleanup.
- How unit, route, controller, and UI tests were divided to provide useful coverage without requiring production services.
- How role-based access control changes both the visible interface and server-side data scope.
- What would be changed for production: object storage, background workers, secret management, observability, and deployment-specific hardening.

## Portfolio disclosure

This is a group project. The public repository credits every contributor and distinguishes Tiago's verified areas of work. The source has been released with team permission, and runtime documents from the university repository have been removed.
