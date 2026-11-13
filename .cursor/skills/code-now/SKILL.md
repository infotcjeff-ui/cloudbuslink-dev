---
name: code-now
description: Implements UI/code changes fast with zero scoping scripts, probe scripts, or analysis-only runs. Use when user invokes /code-now, wants a UI/code change implemented fast, or when about to write a throwaway verification script.
---

# Code Now

Use when you want a UI/code change implemented fast, with zero scoping scripts, probe scripts, throwaway tsconfigs, or analysis-only runs.

Trigger it whenever you are about to write a throwaway verification script.

## 🚦 The One Rule

> Read the code. Edit the code. Deliver.

The time budget for "understanding" is reading 1–3 files with the Read tool. That is it. No script is faster at understanding a codebase than reading it, and no script is required to prove that a five-line JSX change compiles — the Turbopack dev server already told you on save.

## 🚫 Forbidden — the "useless script" family

These are banned for the duration of this command:

| Banned | Why it wastes time | What to do instead |
|---|---|---|
| Generating a scoped tsconfig.*.json for a one-file type check | A whole-program type check costs ~80–95s on this Windows box. A scoped one still costs tens of seconds and requires writing config JSON by hand | Read the dev-server terminal. Turbopack already reported the same errors for free |
| npx tsc --noEmit / npm run validate to "confirm" an edit | Same cost, same information | ReadLints on the edited file (~0s) |
| A probe script that greps the codebase to find where something lives | Grep / Glob do this in milliseconds, and return the actual lines | Grep / Glob / Read |
| A probe script that prints a file's structure, exports, or prop types | Read gives you the whole file | Read |
| A probe script that re-implements business logic to "validate" it | You are not adding logic — you are moving/rendering it | Read the code and move it |
| A one-shot tsx script that calls a server action to check a shape | Only needed for a real runtime bug the dev server cannot show | Only for actual runtime/diagnosis work, and only after the code is done |
| A "let me verify scope first" pass before starting | The file names are in the request | Start editing |

The pattern to recognise: any command whose purpose is to gather information the Read/Grep/Glob tools already give you for free. If the script's output would be "here are the files, here are their contents, here are their exports" — don't write it.

## ✅ The Workflow

1. Read the 1–3 files the request names (Read / Grep / Glob — seconds)
2. Make the edits (StrReplace / Write)
3. Sanity-check the edited file only (ReadLints on that file)
4. Deliver (report what changed, in plain language)

Optional and only if genuinely required:

- `npm run lint:i18n:code <file>` — when you added a translation key
- `npm run icons:find <keyword>` — when you added a new solar: icon
- `npm run lint:focus` — when you touched focus rings
- `npx eslint <file>` — when you want the lint result for one file

All of these are single-file / sub-second gates. They are fine. The banned list is about whole-program and scoping runs.

## 🧭 Decision Rules While Working

- "I don't know where this component lives" → Grep for the component name. Do not write a discovery script. Never.
- "I need to know the props of X" → Read the file that defines X.
- "I need to know if Y is used anywhere" → Grep for Y.
- "I want to make sure my change compiles" → the dev server is already running and already told you. Read its terminal.
- "I want to confirm the whole repo is still clean" → that is `npm run sync:push`'s job (gate 0), at push time. Not now.
- Anything that would take more than ~5 seconds of machine time to produce information you could have read → don't do it.

## 📋 When You Deliver

State:

1. What changed — one row per file, in plain language (what is different now)
2. What you verified — and be honest about what you did not verify

Do not offer to run the type check, the build, or the sync ladder. The operator owns those at push time. If a genuine blocker appears (a real Vercel build failure, a broken dev server), say so and stop.

## 🧹 Cleanup

If you created any temporary file while working (a throwaway tsconfig, a probe script, a scratch file), delete it before delivering. Do not leave debris in the repo.

## 📌 Related Rules

- `.cursor/rules/onefleet-dev-rules.mdc` §10.0 — The Typecheck Prohibition
- `.cursor/rules/agent-self-reliance.mdc` — act, don't ask; read twice, then code
- `.cursor/rules/agent-browser-discipline.mdc` — code-only verification by default
