# Propsync

Propsync is an Obsidian plugin that syncs standard properties across notes by group without syncing their values.

## Features

- Group notes by the `propsync` property
- Show shared properties for each group
- Add missing standard properties to all notes in a group
- Keep existing property values untouched
- Works locally inside your vault

## Use Case

Propsync is useful when multiple notes should follow the same property structure.

For example, in a TTRPG vault, NPC and player character sheets often need the same set of properties. If you later realize that a new property is needed, you do not have to add it manually to every sheet. Instead, you can add the property to the group with Propsync.

## Usage

Add the `propsync` property to the YAML frontmatter of your Markdown notes and assign a group name:

```yaml
---
propsync: Char
---
```

All notes with the same `propsync` value are treated as one group.

Open the Propsync view, select a group, enter one property per line, and sync the group. Missing properties are added to all notes in that group without overwriting existing values.

Example properties:

```txt
name
alias
status
profession
location
```

After syncing, missing properties are added without values:

```yaml
---
propsync: Char
name:
alias:
status:
profession:
location:
---
```

Existing values are never overwritten.

## Privacy

Propsync works locally inside your vault. It does not use telemetry, external servers, or network requests.

## License

MIT