---
title: Future Date Experiment
description: Throwaway post used to test whether the production build hides future-dated posts.
slug: future-date-experiment
authors:
  - subzerodev
date: 2036-07-31T00:00:00Z
tags:
  - site-updates
---

This post exists only to answer one question: does this repository's pinned
Docusaurus template hide a post whose frontmatter date is far in the future
from the production build, the way some Docusaurus blog configurations do?

<!-- truncate -->

This PR is never meant to merge. It exists so CI's `Verify Documentation
Build` check produces a real production artifact that can be inspected for
whether `/future-date-experiment/` exists in it. See MILESTONES.md Milestone
8's scheduling-model discussion for why this matters: model (ii)
("merge now, publish later via a future date") was rejected specifically
because this behavior was unverified, not because it was confirmed false.
