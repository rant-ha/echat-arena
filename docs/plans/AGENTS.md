# plans/ - Implementation & Design Documentation

**Parent:** `../AGENTS.md`
**Type:** Planning Documents, Design Specs, Implementation Guides
**Version:** Phase 9.1
**Last Updated:** 2026-01-23

---

## Purpose

The `plans/` directory contains strategic planning documents, implementation guides, design specifications, and architectural decision records for the echat-arena project. These documents guide feature development, deployment procedures, and code review processes.

**Key Responsibility:** Provide authoritative design specifications and implementation roadmaps to ensure consistent development practices across the project.

---

## Directory Structure

```
plans/
├── README.md                                    # This file (guide to plans directory)
├── MULTI_TURN_TESTING.md                       # Test plan for multi-turn feature
├── DEPLOYMENT_CHECKLIST.md                     # Pre-deployment verification
├── CODE_REVIEW_PHASE5.md                       # Phase 5 code review findings
├── PHASE_8_IMPLEMENTATION_GUIDE.md             # Phase 8 implementation details
├── sessionstore_supabase_design.md             # Session store design (draft)
├── sessionstore_supabase_complete_design.md    # Session store design (final)
├── SESSIONSTORE_IMPLEMENTATION_PROGRESS.md    # Session store progress tracker
├── audit_report.md                             # Security and code audit
└── AGENTS.md                                    # This file
```

---

## Core Planning Documents

### MULTI_TURN_TESTING.md

**Purpose:** Test strategy and verification procedures for multi-turn conversation feature

**Content Includes:**
- Feature overview and requirements
- Test scenarios (single-turn, multi-turn, edge cases)
- Manual test procedures
- Automated test scripts
- Verification checklist
- Known limitations and workarounds

**Use When:**
- Implementing multi-turn features
- Verifying deployment
- Debugging conversation issues
- Adding new conversation logic

**Key Sections:**
1. **Feature Requirements** - What multi-turn should support
2. **Test Scenarios** - All cases to validate
3. **Manual Testing** - Step-by-step UI test procedures
4. **Automated Tests** - Python test scripts
5. **Verification Checklist** - Final sign-off

---

### DEPLOYMENT_CHECKLIST.md

**Purpose:** Pre-deployment verification checklist to ensure production readiness

**Content Includes:**
- Environment configuration checklist
- Database migration verification
- Backend deployment steps
- Frontend deployment steps
- Post-deployment smoke tests
- Rollback procedures
- Critical alerts and monitoring setup

**Use When:**
- Preparing for production deployment
- Verifying environment setup
- Ensuring no critical steps are skipped
- Training new team members on deployment

**Key Sections:**
1. **Pre-Deployment** - Checks before starting
2. **Backend Setup** - Heroku configuration
3. **Frontend Setup** - Vercel configuration
4. **Database Migrations** - Schema application
5. **Smoke Tests** - Post-deployment validation
6. **Monitoring** - Critical alerts to configure

---

### CODE_REVIEW_PHASE5.md

**Purpose:** Documented code review findings and recommendations for Phase 5

**Content Includes:**
- Review scope and objectives
- Code quality findings
- Architecture observations
- Security considerations
- Performance recommendations
- Suggested improvements

**Use When:**
- Understanding historical code review feedback
- Identifying code quality standards
- Learning from previous architectural decisions
- Preventing regression to old issues

**Key Sections:**
1. **Scope** - What was reviewed
2. **Findings** - Issues discovered
3. **Architecture** - Design decisions reviewed
4. **Security** - Vulnerabilities or risks
5. **Recommendations** - Suggested improvements

---

### PHASE_8_IMPLEMENTATION_GUIDE.md

**Purpose:** Detailed implementation guide for Phase 8 (post-vote chat and idempotency)

**Content Includes:**
- Phase 8 objectives and scope
- Feature specifications
- Implementation steps (backend, frontend, database)
- API endpoint specifications
- Data structures and examples
- Testing procedures
- Deployment steps

**Use When:**
- Implementing Phase 8 features
- Understanding post-vote chat workflow
- Implementing vote idempotency
- Writing related tests

**Key Features Covered:**
1. **Post-Vote Chat** - Continuation after voting
2. **Vote Idempotency** - Duplicate vote prevention
3. **Data Isolation** - Keeping experimental data clean

---

### sessionstore_supabase_design.md

**Purpose:** Initial design proposal for Supabase-based session store (Phase 9.1)

**Content Includes:**
- Problem statement (why persistent sessions needed)
- Proposed solution architecture
- Database schema (initial)
- API design
- Concurrency handling approach
- Trade-offs and alternatives

**Use When:**
- Understanding session persistence rationale
- Reviewing architectural decisions
- Evaluating session store implementation

**Status:** Draft/Initial proposal (see `sessionstore_supabase_complete_design.md` for final)

---

### sessionstore_supabase_complete_design.md

**Purpose:** Final comprehensive design for Supabase session store (Phase 9.1)

**Content Includes:**
- Complete problem analysis
- Final solution architecture
- Detailed database schema with all fields
- Optimistic locking mechanism
- TTL and soft delete implementation
- Data structures with JSON examples
- Context isolation strategy
- Migration and upgrade path
- Operational considerations
- Performance optimization strategies
- Testing and validation approach

**Use When:**
- Implementing session persistence
- Understanding optimistic locking
- Designing session data structure
- Planning deployment strategy

**Key Topics:**
1. **Single-Sided Context** - How models see only own history
2. **Optimistic Locking** - Concurrent write handling
3. **TTL Management** - Session expiration
4. **Soft Delete** - Recovery support
5. **Data Migration** - Moving from in-memory to persistent

---

### SESSIONSTORE_IMPLEMENTATION_PROGRESS.md

**Purpose:** Real-time progress tracker for session store implementation

**Content Includes:**
- Implementation tasks and status
- Completed milestones
- In-progress work
- Blocked items and reasons
- Testing results
- Performance metrics
- Known issues and workarounds

**Use When:**
- Tracking Phase 9.1 implementation status
- Identifying blockers
- Understanding what's left to implement
- Planning next work items

**Status:** Updated as implementation progresses

---

### audit_report.md

**Purpose:** Security and code quality audit findings

**Content Includes:**
- Audit scope and methodology
- Security vulnerabilities (if any)
- Code quality issues
- Performance bottlenecks
- Best practice deviations
- Compliance considerations
- Recommendations and action items
- Remediation priority levels

**Use When:**
- Understanding security posture
- Planning code quality improvements
- Addressing audit findings
- Training team on standards

**Key Areas Covered:**
1. **Security** - Authentication, data protection
2. **Performance** - Database queries, API response times
3. **Code Quality** - Style, maintainability, type safety
4. **Infrastructure** - Deployment, monitoring, logging

---

## Document Relationship Map

```
PHASE_8_IMPLEMENTATION_GUIDE.md
  ├─ Implements features from PHASE_8_IMPLEMENTATION_GUIDE.md
  └─ Uses schema from migrations/

SESSIONSTORE_SUPABASE_DESIGN.md
  ├─ Initial proposal
  └─ Refined into sessionstore_supabase_complete_design.md

sessionstore_supabase_complete_design.md
  ├─ Guides implementation (SESSIONSTORE_IMPLEMENTATION_PROGRESS.md)
  ├─ Defines schema (migrations/add_arena_sessions_table.sql)
  └─ Specifies API (app.py)

SESSIONSTORE_IMPLEMENTATION_PROGRESS.md
  ├─ Tracks progress toward complete design
  ├─ Identifies blockers from audit_report.md
  └─ Tests defined in MULTI_TURN_TESTING.md

DEPLOYMENT_CHECKLIST.md
  ├─ Uses migrations from migrations/
  ├─ Implements steps from phase guides
  └─ Verifies against MULTI_TURN_TESTING.md

CODE_REVIEW_PHASE5.md
  ├─ Reviews implementation from previous phase
  └─ Informs current coding standards
```

---

## Using These Documents Effectively

### For Feature Development

**Workflow:**
1. Read relevant phase guide (e.g., `PHASE_8_IMPLEMENTATION_GUIDE.md`)
2. Review design spec (e.g., `sessionstore_supabase_complete_design.md`)
3. Check code review findings (`CODE_REVIEW_PHASE5.md`) for similar issues
4. Implement following standards
5. Update progress document (`SESSIONSTORE_IMPLEMENTATION_PROGRESS.md`)
6. Test using procedures in relevant document
7. Check against deployment checklist before deploying

### For Deployment

**Workflow:**
1. Open `DEPLOYMENT_CHECKLIST.md`
2. Work through each section
3. Run migrations per `migrations/README.md`
4. Execute smoke tests from checklist
5. Verify monitoring alerts configured
6. Keep deployment log with checklist

### For Code Review

**Workflow:**
1. Review code against findings in `CODE_REVIEW_PHASE5.md`
2. Check security items in `audit_report.md`
3. Verify implementation matches relevant phase guide
4. Test using procedures from feature testing docs
5. Document findings in new review document (if different phase)

### For Audit & Compliance

**Resources:**
- `audit_report.md` - Complete security/quality findings
- `CODE_REVIEW_PHASE5.md` - Code quality decisions
- Phase guides - Architectural decisions
- Design specs - Technical justification

---

## Document Conventions

### Metadata Headers

Each planning document starts with:
```
# Document Title

**Purpose:** What this document accomplishes
**Scope:** What is/isn't covered
**Status:** Draft/Active/Archived
**Owner:** Responsible person (if applicable)
**Version:** Version number or phase
**Last Updated:** Date
**Related:** Links to related documents
```

### Content Organization

Documents follow consistent structure:
1. **Overview** - What and why
2. **Details** - How and specifications
3. **Examples** - Concrete use cases
4. **Procedures** - Step-by-step instructions
5. **Checklist** - Verification items
6. **Troubleshooting** - Common issues
7. **Appendix** - Reference materials

### Code Examples

All code examples include:
- Language identifier (sql, python, typescript, bash)
- Brief description of what it does
- Complete, runnable code
- Expected output or result

```sql
-- Example: Query multi-turn votes
SELECT turn_count, COUNT(*) FROM votes GROUP BY turn_count;
-- Expected: Distribution of conversation lengths
```

---

## Planning Standards

### Specification Format

When documenting new features:
1. **Requirements** - What must be implemented
2. **Scope** - What is in/out of scope
3. **Design** - Architecture and data structure
4. **API** - Endpoints and payloads
5. **Database** - Schema changes (migrations)
6. **Testing** - How to verify correctness
7. **Deployment** - How to deploy safely

### Phase Definition

Each phase includes:
- **Phase Number** (e.g., Phase 8.2)
- **Title** - What this phase adds
- **Objectives** - Goals to achieve
- **Deliverables** - What gets built
- **Duration** - Estimated timeline
- **Status** - Current progress

---

## Updating & Maintaining Documents

### When to Update

- New feature implemented → Add to relevant guide
- Design decision made → Document in design spec
- Issue found → Add to audit or finding document
- Procedure changes → Update applicable checklist
- Lessons learned → Add to troubleshooting section

### Review Cycle

**Recommended:** Quarterly review of all documents

**Each Review:**
- ✓ Verify links still accurate
- ✓ Update version numbers if changed
- ✓ Add new findings/issues
- ✓ Archive obsolete information
- ✓ Update "Last Updated" date

### Version Control

All documents maintained in git:
```bash
# View history
git log --oneline plans/DEPLOYMENT_CHECKLIST.md

# See what changed
git diff HEAD~1 plans/DEPLOYMENT_CHECKLIST.md

# Annotate specific line
git blame plans/DEPLOYMENT_CHECKLIST.md
```

---

## Cross-References to Other Directories

### Root Project Guide
- `/home/ranthaha1/echat-arena/AGENTS.md` - Authoritative parent guide

### Backend Implementation
- `/home/ranthaha1/echat-arena/app.py` - Implements designs from phase guides
- `/home/ranthaha1/echat-arena/requirements.txt` - Dependencies used in implementation

### Database Schema
- `/home/ranthaha1/echat-arena/migrations/` - SQL implementations of database designs
- `/home/ranthaha1/echat-arena/migrations/README.md` - Migration guide
- `/home/ranthaha1/echat-arena/migrations/add_arena_sessions_table.sql` - Phase 9.1 schema

### Frontend Implementation
- `/home/ranthaha1/echat-arena/web/` - Frontend UI implementation
- `/home/ranthaha1/echat-arena/web/README.md` - Frontend developer guide

### Testing & Deployment
- `/home/ranthaha1/echat-arena/DEPLOYMENT_GUIDE.md` - Practical deployment guide
- `/home/ranthaha1/echat-arena/test_*.py` - Test scripts
- `/home/ranthaha1/echat-arena/run_experiment.py` - Experiment runner

---

## Document Accessibility

### Finding the Right Document

**By Task Type:**

| Task | Document |
|------|----------|
| Adding multi-turn feature | `MULTI_TURN_TESTING.md` + `PHASE_8_IMPLEMENTATION_GUIDE.md` |
| Implementing session store | `sessionstore_supabase_complete_design.md` + `SESSIONSTORE_IMPLEMENTATION_PROGRESS.md` |
| Deploying to production | `DEPLOYMENT_CHECKLIST.md` + `DEPLOYMENT_GUIDE.md` |
| Code review | `CODE_REVIEW_PHASE5.md` + `audit_report.md` |
| Security questions | `audit_report.md` + root `AGENTS.md` |
| Architecture decisions | Phase design specs + `CODE_REVIEW_PHASE5.md` |

**By Document Type:**

| Type | Documents |
|------|-----------|
| Implementation Guides | `PHASE_8_IMPLEMENTATION_GUIDE.md` |
| Design Specifications | `sessionstore_supabase_design.md` + `sessionstore_supabase_complete_design.md` |
| Testing Procedures | `MULTI_TURN_TESTING.md` + `DEPLOYMENT_CHECKLIST.md` |
| Progress Tracking | `SESSIONSTORE_IMPLEMENTATION_PROGRESS.md` |
| Code Quality | `CODE_REVIEW_PHASE5.md` + `audit_report.md` |

---

## Common Document Updates

### After Implementing a Feature

1. Update `SESSIONSTORE_IMPLEMENTATION_PROGRESS.md` with completion status
2. Add test results to relevant testing document
3. Update deployment checklist if procedures changed
4. Add troubleshooting tips if issues discovered

### After Code Review

1. Document findings in new review document (if new phase)
2. Update `CODE_REVIEW_PHASE5.md` with applicable findings
3. Note architectural patterns in relevant design doc
4. Highlight any security issues to audit report

### After Deployment

1. Update `DEPLOYMENT_CHECKLIST.md` if procedures changed
2. Document any issues in relevant guide's troubleshooting
3. Update performance metrics in monitoring section
4. Note successful deployment in progress tracker

---

## Templates & Examples

### Planning a New Feature

**Template:**
```markdown
# PHASE_X_IMPLEMENTATION_GUIDE.md

**Purpose:** Implement [feature name]
**Status:** In Progress

## Overview
[Feature description]

## Requirements
- Requirement 1
- Requirement 2

## Implementation Steps
1. Database schema changes (add to migrations/)
2. Backend API changes (app.py)
3. Frontend UI changes (web/)
4. Testing & verification

## API Changes
[Endpoint specifications]

## Testing
[Test procedures]
```

---

## Quick Reference: When to Create New Documents

**Create new document if:**
- Starting a new major phase (e.g., Phase 10)
- Planning a significant feature
- Performing comprehensive review
- Documenting critical decision

**Update existing if:**
- Minor feature or bug fix
- Implementation detail
- Procedure clarification
- Progress update

---

## Version & Updates

**Version:** Phase 9.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Recent Changes:**
- Phase 9.1: Added session persistence design documents
- Phase 8.3: Added vote idempotency to implementation guide
- Phase 8.2: Added post-vote chat implementation guide
- Ongoing: Updated progress tracking documents

---

## Support & Navigation

**Getting Started:**
1. Start with `../AGENTS.md` for project overview
2. Find relevant phase guide for your task
3. Read design spec for detailed architecture
4. Use implementation guide for step-by-step instructions
5. Reference testing docs for verification
6. Consult deployment checklist before production

**Need Help?**
- Check troubleshooting sections in relevant documents
- Review `audit_report.md` for security/quality standards
- Look at `CODE_REVIEW_PHASE5.md` for coding patterns
- Refer to parent `AGENTS.md` for project-wide information

---

**Maintain Clarity:** Keep all documents updated as project evolves. Archive obsolete information. Reference this guide when adding new documents.
