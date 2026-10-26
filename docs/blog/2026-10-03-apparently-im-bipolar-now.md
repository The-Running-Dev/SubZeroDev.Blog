---
title: "Apparently I'm Bipolar Now"
description: "A speech-to-text system casually inserted a psychiatric diagnosis into a conversation about drinking, and everybody carried on for one reply too long."
slug: apparently-im-bipolar-now
authors:
  - subzerodev
date: 2026-10-03T18:07:00Z
tags:
  - stories
  - ai
  - absurd
---

# Apparently I'm Bipolar Now

We were talking about drinking.

Specifically, the fact that my relationship with alcohol is complicated.

Home drinking behaves one way.

Bar drinking behaves another.

Sometimes I drink and work for hours.

Sometimes I keep going long after the useful part of the evening has ended.

Not especially simple.

Fine.

Then the transcription system decided the conversation needed a psychiatric diagnosis.

<!-- truncate -->

I apparently said:

> “When people try to tell me I'm an alcoholic and bipolar…”

Except I did not remember saying anything about bipolar disorder.

Because I had not meant to say anything about bipolar disorder.

That was not the subject.

It was not an example.

It was not a side note.

It was not remotely part of the fucking conversation.

The transcription just wandered into psychiatry, grabbed a diagnosis off the shelf, and inserted it into the sentence.

And then ChatGPT, being extremely helpful, responded to it.

## The Machine Accepted the Premise

This is the part that makes the whole thing perfect.

The transcript said bipolar.

The model read bipolar.

So the model produced a careful little explanation about how bipolar disorder is clinically complicated and how drinking or productivity does not establish a diagnosis.

Technically reasonable.

Completely irrelevant.

I read the response and went:

> Wait.

> How the fuck is bipolar in here?

And suddenly we had to perform incident response on a mental-health condition I had never introduced.

Wonderful.

## Root Cause Analysis

Step one:

I say something about alcohol being complicated.

Step two:

Speech-to-text produces:

> alcoholic and bipolar

Step three:

Language model says:

> Well, those labels are complicated and should not be inferred from a few behaviors.

Step four:

Human says:

> Motherfucker, who said bipolar?

Step five:

Everyone checks the logs.

Step six:

The transcription system slowly backs out of the room.

No apology.

No ticket.

No postmortem.

Just another ordinary day in AI-assisted communication.

## This Is a Serious Word

The reason it jumped out at me is that bipolar disorder is not some casual adjective to throw into a sentence because the audio was fuzzy.

It is an actual psychiatric disorder.

I have known people with bipolar disorder.

That is an entirely different fucking subject.

So seeing it casually materialize inside a conversation about my drinking pattern was not just inaccurate.

It was surreal.

There is a huge difference between:

> My drinking behavior changes depending on context.

and:

> Apparently I have acquired a psychiatric diagnosis through speech recognition.

Those are not neighboring concepts.

There should not be an autocomplete path between them.

## The Confidence Chain

The funniest part is how cleanly the error propagated.

The transcription did not say:

> [unclear]

It did not say:

> maybe bipolar?

It simply placed the word in the sentence like it had always lived there.

Then the model had no reason to know that the transcript was wrong.

It answered the text it received.

That is how bullshit gets industrialized.

One system makes a tiny confident mistake.

The next system treats the output as authoritative input.

Then a third system could summarize the conversation and write:

> User discussed being bipolar.

Congratulations.

We have now built a distributed hallucination.

At scale.

## Somewhere a Database Is Getting Ideas

This is where my software-engineer brain becomes unhelpful.

Because once I notice the propagation pattern, I immediately imagine the architecture.

Speech recognition:

> bipolar = true

Conversation model:

> user states people call him bipolar

Summary process:

> bipolar discussed

Memory system:

> interesting recurring user context

Some future assistant:

> Given your bipolar disorder—

Absolutely fucking not.

Now I am debugging my own biography.

This is why provenance matters.

Not only in databases.

Not only in AI systems.

In ordinary conversation.

Where did this fact come from?

Did the person actually say it?

Did the transcription invent it?

Was it inferred?

Was it quoted?

Was it somebody else's claim?

Was it a fucking typo?

Apparently these are now existential questions.

## The Conversation Had Been Fine

What makes the detour even better is that the conversation before that was coherent.

I had noticed that drinking at home and drinking socially produce different behavior.

At home, there is no natural stopping point.

At a bar, there is.

At home, I may keep going for hours.

At the bar, I am talking to people and my consumption stays more bounded.

Then we got into the fact that alcohol sometimes seems to motivate activity for part of the evening.

Complicated.

Interesting.

Worth examining.

And then:

**BIPOLAR DISORDER HAS ENTERED THE CHAT.**

Why?

Nobody knows.

Maybe the microphone knows.

The microphone is not talking.

## The Model Wasn't Being Crazy

The irritating thing is that ChatGPT's response was internally sensible.

Given the text it received, it was trying to separate casual labels from clinical diagnosis.

Perfectly defensible.

Wrong conversation.

This is an important distinction because the failure did not happen where it looked like it happened.

The visible nonsense came out of the language model.

But the corruption happened upstream.

Classic distributed system.

The consumer is behaving correctly against poisoned input.

Wonderful.

I have spent decades debugging this exact class of problem.

Apparently now I get to do it while speaking.

## Human in the Loop

Fortunately, there was one remaining verification layer.

Me.

I read the answer.

My internal validator fired.

> That is not a thing I said.

So I asked.

The transcript was checked.

There it was.

Right in the previous message.

Bipolar.

Installed by transcription.

The correction was easy.

Strike the branch from the record.

Return to alcohol.

Continue.

No need for a diagnostic adventure.

No need to unpack symptoms.

No need to ask how I feel about mania.

No need for a fourteen-part clinical questionnaire.

The fucking word was wrong.

Delete conceptual branch.

Move on.

## Apparently I'm Bipolar Now

This is the sort of thing that would have sounded ridiculous five years ago.

I did not announce a diagnosis.

Nobody diagnosed me.

Nobody even intended to discuss bipolar disorder.

And yet for one conversational turn, there it was.

A complete new fact about my life generated by the interface layer.

That is impressive.

Speech recognition used to mishear restaurant names.

Now it can apparently rewrite your psychiatric history.

Progress.

## The Patch

The final correction was simple:

I do not have bipolar disorder.

That was not what I was talking about.

The transcription inserted it.

End of fucking issue.

But the little detour is worth preserving because it is such a perfect modern failure.

A human speaks.

A machine translates speech into text.

Another machine reasons over the text.

The human stares at the output and says:

> What the fuck are you talking about?

Then everybody discovers that the original sentence never existed.

No grand philosophical conclusion required.

No lesson about identity.

No diagnosis.

Just an input bug with excellent comedic timing.

Apparently I'm bipolar now.

No.

Apparently the transcription needs a code review.
