---
name: explain-back
description: Grade Utkarsh's five-line explain-back of a PR, label the PR with the grade, and log it to docs/LEARNING.md. Use when he says "explain back", "grade my explanation", or runs /explain-back <pr-number>.
---

# Explain-back

The learning gate before any merge. Utkarsh explains a PR in five lines without reopening the code; you grade it against the code.

## Input

`/explain-back <pr-number>`. If no number is given, use the PR for the current branch (`gh pr view --json number`).

## Steps

1. Read the PR: `gh pr view <n> --json title,body,comments,labels` and `gh pr diff <n>`.
2. Find his explain-back: the most recent PR comment authored by him that is not a grade reply. If none exists, stop and ask him to post one on the PR, five lines:
   1. what data enters
   2. what calls happen, in order
   3. what is written where
   4. what fails and what the system does when it fails
   5. one thing he would change
3. Grade 1 to 5 against the diff, not against his words. For each line, decide: correct, incomplete, or wrong. Missing failure states (line 4) cap the grade at 3. A wrong data-flow claim (lines 1 to 3) caps it at 2.
4. Post a reply comment on the PR: the grade, then one line per explain-back line saying correct / incomplete / wrong and why, then the single most important thing he missed. Under 15 lines. No praise padding.
5. Apply the label: remove any existing `explained:*`, add `explained:<grade>`.
6. Append to `docs/LEARNING.md` under today's date: PR number and title, grade, the concept the PR exercised, and the one thing he missed (this is what /quiz-me drills).
7. If the grade is below 3, say so plainly and offer a walkthrough of the specific part he got wrong, then he posts a second explain-back and you grade again.

## Rules

- Grade honestly. A 5 means an interviewer could not trip him up on this module.
- Never write the explain-back for him, even partially. Walkthroughs explain the code; they do not draft his lines.
- The merge hook (`.claude/hooks/require-explain-back.sh`) reads the label. Do not apply a label without a real grade.
