# Working in a Kanwas folder

This folder is a **Kanwas workspace**. A local daemon (`kanwasd`) is watching it
and renders it live as a spatial canvas in the browser. **The folder is the
source of truth** — everything is plain files. You are a CLI agent (Claude Code,
Codex, …) editing those files directly. There is no Kanwas-specific API, plugin,
or tool you need: just read and write files normally and the canvas follows.

## How files map to the canvas

| On disk                                                                            | On the canvas                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| a **directory**                                                                    | a **canvas** (nested directories are nested canvases) |
| a **`.md` file**                                                                   | a **rich-text node** (the note's body)                |
| an **image / audio / pdf** (`.png .jpg .jpeg .gif .webp .svg .pdf .mp3 .wav .m4a`) | a **media node**                                      |
| `metadata.yaml` (one per directory)                                                | that canvas's **layout** — node positions, edges, ids |

So to add a note to a canvas, create a `.md` file in the matching directory. To
add a sub-canvas, create a subdirectory. Changes show up in the open canvas
within about a second — no save step, no import.

## The rules that matter

**Just create and edit `.md` files and folders.** That is the whole workflow.
A new `.md` file becomes a node automatically; a new folder becomes a canvas.
You never have to register anything.

**Frontmatter is preserved, verbatim.** A leading `---` YAML block at the top of
a `.md` file is kept byte-for-byte and hidden from the visual editor. Add, keep,
or read frontmatter freely — editing the note in the UI will not touch it.

**The note _body_ may be cosmetically reformatted.** Your files on disk are the
truth and your exact content is preserved, but when a note is edited on the
canvas the body is rewritten in the editor's canonical markdown — e.g. list
bullets `-` may come back as `*`, and spacing may be normalized. This is
cosmetic only (no content is lost) and does not affect frontmatter. Don't be
alarmed if a note's body formatting shifts after someone edits it in the UI;
prefer semantic checks over exact-byte comparisons of note bodies.

**`metadata.yaml` is the layout sidecar — read freely, edit sparingly.** It holds
each node's id, position, size, and the edges (connections) between nodes:

```yaml
id: root # this canvas's id ("root" for the top folder, else a uuid)
name: Writing
xynode:
  position:
    x: 0
    y: 220
edges: # connections drawn between nodes on this canvas
  - id: e1
    source: 9a1b... # a node id
    target: 3c4d... # another node id
nodes:
  - id: 9a1b... # a node's stable id — do not change
    name: bluf # matches bluf.md in this directory
    xynode:
      id: 9a1b...
      type: blockNote # .md -> blockNote; images/audio -> image/audio; etc.
      position:
        x: 120
        y: 40
      data: {}
```

- **Safe to read** — use it to find node ids, positions, and how notes connect.
- **Edit only to reposition or connect nodes** — change a node's `position`, or
  add an entry to `edges` to draw a link between two node ids.
- **Do not invent or change `id` values, and do not hand-add node entries for
  files** — it is created and maintained for you. When you add a `.md` file, its
  node (with a fresh id and a default position) is appended automatically. When
  you delete a file, its node entry is removed.

**`.kanwas/` is internal — never edit or delete it.** It holds the workspace id
and a trash folder for things deleted from the UI. Leave it alone.

**Deleting a file removes its node.** Delete `.md` files and folders normally;
the corresponding node/canvas disappears. (Deletions you make from the _UI_ are
moved to `.kanwas/trash/` rather than hard-deleted; deletions you make on disk
are your own to manage — use git.)

## One known limitation: avoid cross-directory `mv` of existing files

Renaming a file **within the same directory** keeps its node identity (its
position and connections are preserved). But **moving a `.md` or media file into
a different directory while the daemon is live currently mints a new node** — the
old node's position and edges are lost, and the file starts fresh on the
destination canvas. If you need to reorganize across directories, prefer creating
the file in its target directory, or expect the moved node to reset. (A daemon
restart re-adopts a moved file, but its id may still change.)

## Things that live only on the canvas

Sticky notes, plain-text snippets, links, groups, and sections have **no backing
file** — they live inside `metadata.yaml`. You generally won't create these from
the CLI; work through `.md` files and media, and let the user arrange the rest in
the canvas.
