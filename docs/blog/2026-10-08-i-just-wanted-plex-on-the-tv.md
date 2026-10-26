---
title: "I Just Wanted Plex on the Fucking TV"
description: "A missing Plex connection leads to network archaeology, a homemade Ubuntu gateway, forgotten documentation, and Lucifer asking why the NAS needs so many network cards."
slug: i-just-wanted-plex-on-the-tv
authors:
  - subzerodev
date: 2026-10-08T12:00:00Z
tags:
  - lucifer
  - absurd
  - stories
draft: true
---

Plex wasn't accessible from the TV.

That was the problem.

The entire problem. A television could not reach a media server. There was no strategic initiative. Nobody had requested an infrastructure review.

Lucifer looked over my shoulder.

> "What are you doing?"

"Trying to watch something."

He looked at the routing table.

> "Is it a documentary about subnets?"

<!-- truncate -->

## The Previous Tenant Was Me

Somewhere in the investigation, I began remembering how the network had been put together.

This was unfortunate.

Apparently, at some point, Past Ben had decided that simply having an internet connection was insufficient.

The traffic needed to go through NordVPN. DNS needed filtering. DNS needed encryption. DNS leaks needed preventing. The whole thing needed to survive a reboot without requiring someone to stand beside it reciting commands.

Individually, perfectly reasonable requirements.

Collectively, a reason there was an Ubuntu machine doing a router's job.

> "Who configured this?" Lucifer asked.

"Me."

> "Who maintains it?"

"Also me."

> "Who are you currently angry with?"

I did not appreciate the direction of the interview.

## A Brief Tour of the Summoning Circle

The old setup had two related jobs.

Ubuntu forwarded the household traffic through NordVPN. The DNS stack handled the question of where any of that traffic was supposed to go.

The DNS path was:

```text
LAN clients
  → Ubuntu host
    → Pi-hole
      → DNSCrypt-Proxy on 127.0.0.2:5053
        → encrypted upstream resolver
```

Pi-hole did the filtering. DNSCrypt-Proxy handled the encrypted upstream DNS. The notes named Cloudflare, NextDNS, and Quad9 in the resolver configuration.

NordVPN was told to use localhost DNS so it would use the local stack. There were routing rules for keeping that local traffic local.

Meanwhile, the VPN notes covered NordLynx, IP forwarding, a default route through `nordlynx`, NAT, MASQUERADE, LAN forwarding, persistent firewall rules, autoconnect, kill-switch settings, and a reconnect command at boot.

Yes, MASQUERADE.

Even the firewall was attending in costume.

Lucifer studied the topology.

> "The computer asks another part of the same computer to ask another part of the same computer where the internet is?"

"Broadly."

> "And then sends the traffic through a tunnel?"

"Yes."

> "Where is the television?"

"That is becoming a philosophical question."

## I Should Not Know This Shit

At some point, I caught myself discussing routes, forwarding, DNS enforcement, and whether the network boundary belonged on a different machine.

I should not know this shit.

Not because it is unknowable. Plenty of people know it. Those people chose networking. Some of them presumably enjoy it and have chairs appropriate to their profession.

I remember deciding networking was too low-level for me.

A perfectly sensible boundary.

Apparently, my brain recorded it as a suggestion.

Because now I was looking at a homemade gateway and recognizing the individual curses.

> "You seem familiar with the ritual," Lucifer said.

"I don't want to be."

> "That wasn't the question."

There is a particular kind of technical knowledge that arrives without permission. You need one thing to work, so you learn the thing underneath it. That exposes another thing. You learn enough of that to continue.

Years later, someone says "NIC passthrough" and a cupboard in your head opens by itself.

No wizard school. No robe. No useful pension arrangement.

Just a technomancer in front of a TV, wondering why leisure has prerequisites.

## The Cisco Evidence

Unfortunately, this was not my first encounter with the lower layers.

There was history.

An old business Cisco router.

Telnet.

The sort of memory that should arrive with a museum curator and a little card explaining why we no longer do that.

I had configured actual networking equipment through Telnet, then somehow continued describing myself as someone for whom networking was too low-level.

Lucifer opened an imaginary personnel file.

> "Previous experience: negotiating with ancient Cisco equipment."

"That was a long time ago."

> "Current position: accidentally responsible for domestic packet transit."

"I write software."

> "Apparently the packets disagree."

I had not escaped networking. I had merely stopped putting it on the label.

## The NAS Enters the Chat

Then there was the NAS.

A storage machine. A box for files. A sensible appliance with a clearly defined purpose.

Also a machine with enough network interfaces to make the phrase "clearly defined purpose" sound optimistic.

Naturally, once you remember those interfaces exist, an entirely unhelpful thought appears:

> "Couldn't this be the router?"

And now we're discussing OPNsense. Virtual machines. Passing network cards through to the machine that would do the routing. Whether the box holding the media should also become the box deciding how everything reaches everything else.

These were possibilities under discussion. The NAS had not been formally promoted.

But the interview was going well.

Lucifer put a hand on the case.

> "What did this machine do when you bought it?"

"Store files."

> "What are you considering asking it to do now?"

"Run the network."

> "Has it requested this additional responsibility?"

"It has spare interfaces."

He nodded slowly.

> "Of course. Capacity is consent."

The original ticket still read:

**Plex isn't accessible from the TV.**

The proposed scope now included constitutional reform for the household network.

## Somewhere, Someone Had Packaged It

Then came OpenWrt.

And NordVPN Lite.

NordVPN has an [OpenWrt setup guide for its NordVPN Lite client](https://support.nordvpn.com/hc/en-us/articles/41793554983953-How-to-set-up-NordVPN-on-an-OpenWRT-router-using-NordVPN-Lite).

Which meant there was a supported route worth investigating for putting the VPN client on a compatible router.

A router.

Doing router things.

With software intended for the router.

I needed a moment.

This did not magically reproduce every part of my Pi-hole and DNSCrypt arrangement, establish hardware compatibility, or explain why the TV couldn't reach Plex. There were still actual questions to answer.

But it did introduce the possibility that the next version might require fewer personal incantations.

> "So," Lucifer said, "somebody has packaged part of the thing you assembled by hand?"

"Yes."

> "And finding that required reconstructing your previous arrangement, revisiting Cisco, and considering a career change for the NAS?"

"Research is rarely linear."

> "Neither is your DNS."

## The Documentation Arrives at the Worst Possible Time

Then I found the documentation.

Of course I fucking did.

After the archaeology. After piecing the setup back together in conversation. After dragging old knowledge out of whatever cupboard my brain had hidden it in.

Two Markdown files:

- `pi-hole-dnscrypt-proxy.md`
- `nordvpn.md`

Proper notes.

Architecture diagrams. Installation steps. The Pi-hole upstream address. The DNSCrypt listener. Routing. Firewall rules. Persistence. Reconnect-on-boot instructions.

Past Ben had done the responsible thing.

This was deeply inconvenient for my argument that Past Ben was an irresponsible bastard.

> "You documented it," Lucifer said.

"Yes."

> "You forgot you documented it."

"Yes."

> "And you couldn't find it until you had already reconstructed the thing it documented."

"Apparently."

He sat down.

> "You have documentation with a recovery quest."

I had written myself a resurrection manual for the network, then misplaced the map to the resurrection manual.

The backup existed. The restore procedure required character development.

## The Filing Cabinet Has No Index

The annoying part is that I recognize this mechanism.

I read something while trying to solve a completely different problem. I don't retain the address. Sometimes I don't retain enough detail to explain what I read.

But something gets filed.

Months later, a problem appears and my brain announces:

> **I know this is fucking possible.**

Excellent.

Where?

Silence.

How?

Silence.

Could we at least have a search term?

> **You read it somewhere.**

Thank you, organic knowledge-management platform. Exceptional service.

It remembers that there is a path. It does not consider retaining the path itself part of the contract.

Apparently, the same policy applies to things I have personally built and documented.

Lucifer closed the imaginary personnel file.

> "What did you learn from this?"

"That I should keep better track of my documentation."

> "Will you?"

"I should probably build a system for—"

He raised one finger.

Pointed at the television.

Right.

The television.

I just wanted Plex on the fucking TV.
