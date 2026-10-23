# ADR-0002: Course format: schema dialect, stable ids, versions and extensions

- **Status:** Proposed
- **Date:** 2026-10-23
- **Deciders:** project lead (accepts on merge)
- **Roadmap / spec ids:** M1-01, ENG-02; rise.md §4 "Our course document", rise.md §4 "Learner state
  stored in the LMS", standards.md §4.2

## Context

Every app, the player and every exporter read the same course document (rise.md §4 "Our course
document"). It lives for years, crosses desktop, server and sync, and is opened by older and newer
releases of our apps. Learner progress is keyed by stable ids rather than positions and must fit SCORM
1.2's 4,096-character suspend data; SCORM 1.2 interaction ids are capped at 255 characters
(standards.md §4.2, rise.md §4 "Learner state stored in the LMS"). So ids must be short, stable and
valid in every standard.

## Decision

### Schema dialect

- The format is defined in **JSON Schema 2020-12**; every schema file declares
  `"$schema": "https://json-schema.org/draft/2020-12/schema"`. TypeScript types are generated from it.
- Schemas are **closed**: `unevaluatedProperties: false` on every object, except the extension
  namespace below.
- JSON Schema cannot check cross-references, so `packages/format` runs a second validation pass in code
  (reference integrity, below). Both passes report errors with a JSON Pointer path.

### Course document and project container

- **Course document:** one JSON value that holds the course content and nothing else. Its root carries
  `schemaVersion` and `id`. The root `id` is the **project id**.
- **Project container:** what stores a document together with its media files, autosave and
  thumbnails. On desktop its form is decision D-4; on the server it is database rows plus object
  storage. Server-only metadata (owner, lineage, share ids, last-updated-by) lives in the container,
  never in the document, so it can never reach a published package.
- Media is referenced from the document by storage key through the document's media index; the bytes
  live in the container.

### Ids

- **Project id:** a random UUID (RFC 9562 version 4, `crypto.randomUUID()`).
- **Content ids** (entries, blocks, items, questions, answers, variables, media entries, and every other
  object that can be referenced): 10 characters, a lowercase letter followed by 9 lowercase letters or
  digits (`^[a-z][a-z0-9]{9}$`), from `crypto.getRandomValues`. That is about 51 bits: collisions in a
  course are negligible and are still checked. The leading letter keeps ids valid as XML `ID` values in
  SCORM 2004 manifests; the short length leaves room in the 255-character interaction id and the
  resume budget.
- Content ids are unique within one document. Ids are identity, never display text or position.

| Operation | Project id | Content ids |
|---|---|---|
| Copy the project file, back up, restore | kept | kept |
| Save as, save as template, send to library | new | kept |
| Duplicate an object inside the same document | kept | new for the copy and everything inside it; references inside the copy are remapped |
| Paste or import into another document | target's | kept, unless an id already exists in the target: then a new id and remapped references |
| Publish and export (all standards), republish an update | kept | kept, so learner resume and LMS records survive an update |
| Import of a package or XLIFF file we exported | kept | kept |
| Import from a foreign format (for example PowerPoint) | new | minted once at import, stable from then on |
| Sync and co-editing | kept | kept; sync never re-mints. A collision found at merge re-mints the later object and remaps its references |

### Versions and migrations

- `schemaVersion` is `"MAJOR.MINOR"`. **MINOR** adds optional fields only. **MAJOR** is any other
  change.
- Migrations are **forward-only**: one pure function per version step, applied in order when a document
  is opened. There are no down-migrations. Before the first save in a newer version, the original file is
  kept as a backup.
- A document from a **newer MINOR** of the same MAJOR opens read-write. Properties the app does not
  know are kept verbatim on save, and `schemaVersion` stays at the newer value.
- A document from a **newer MAJOR** opens **read-only**: the app says which version wrote it and offers
  an update. No save, autosave, publish or sync write is possible.

### Extension namespace

- Data the schema does not define (plugins, imports from other tools, experiments) goes only in `ext`,
  an optional object on the course and on every object that has an id. Its keys are reverse-DNS
  namespaces (`org.example.plugin`); each value is any JSON.
- `ext` is preserved verbatim through every operation in the id table. Exporters leave it out of
  published packages unless a plugin that owns the namespace asks for it.
- Unknown properties outside `ext` are a validation error, except the newer-MINOR case above.

### Reference integrity

- Every reference is by id (or by storage key for media) and must resolve inside the document. A
  reference to something outside it (a shared question bank, a template, a library item) names the
  owning container's id as well, and is reported as external, never as missing.
- Ids are unique within the document; every media reference has an entry in the media index.
- Editing commands keep integrity in one undo step: deleting a referenced object also clears or removes
  the references to it.

## Consequences

- Older apps keep newer data within a MAJOR; a MAJOR bump needs a migration and makes older apps
  read-only, so MAJOR bumps should be rare and announced.
- Resume, interaction ids and LMS identifiers can be built from ids without lookup tables, and stay
  stable across republishing.
- Follow-ups: schema package and fixtures (M1-02); migrations, project identity and `ext` handling
  (M1-03); interaction and answer id builders (M1-05); resume codec (M1-08); desktop container (D-4).

## Alternatives considered

- **Draft-07:** more tooling, but no `unevaluatedProperties`, which closed schemas with composition need.
- **UUIDs for every id:** 36 characters each would use up the SCORM 1.2 resume budget quickly.
- **Sequential or position ids:** collide under co-editing and sync, and change on reorder.
- **Open schemas that keep any unknown field:** typos and stale fields would pass validation silently.
- **Down-migrations:** double the migration work and cannot restore data a newer version added.
