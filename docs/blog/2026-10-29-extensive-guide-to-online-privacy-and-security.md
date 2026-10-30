---
title: "Extensive Guide to Online Privacy and Security"
description: "A practical reference for Windows protection, password managers, encrypted files, malware recovery, DNS filtering, firewalls, and everyday privacy."
slug: extensive-guide-to-online-privacy-and-security
authors:
  - subzerodev
date: 2026-10-29T12:00:00Z
tags:
  - privacy
  - security
---

I started with a Windows installation guide for a friend, then realized how many privacy and security habits I had accumulated over time. Writing them all down made that surprisingly obvious.

If you need to rebuild your computer, start with [Complete Guide to Installing Windows 11](https://blog.subzerodev.com/complete-guide-to-installing-windows-11/). This entry is the companion reference for additional hardening and privacy.

<!-- truncate -->

## Start with the essentials

These are the tools and practices I use or recommend, with their limits explained. No combination makes a computer or an account invulnerable. The aim is to reduce common routes in, protect what matters, and make recovery possible.

These chapters are a reference library, not a requirement to install eleven more products. Work through the essentials first and test one change before adding another.

| When | What to do |
| --- | --- |
| **Next: the essentials** | Chapters 1, 2, and 6: update Windows, use Defender or ESET, enable BitLocker with offline recovery keys, choose one password manager, and verify a separate backup. |
| **Before using a replacement wallet** | Chapter 5: secure accounts, revoke stolen sessions, and replace compromised wallet secrets from a clean device. A reinstall cannot undo stolen secrets. |
| **Another short session** | Chapters 7 and 9: choose one DNS filter and review browser safety. |
| **Only when useful** | Chapters 3 and 4: encrypted vaults, VPN features, and Windows privacy settings. |
| **Later, with help** | Chapters 8 and 10: strict outgoing firewall rules or Linux with a Windows VM. Chapter 11 is an optional software-installation shortcut. |

## Chapters

- [Chapter 1: Windows security, ESET or Defender, and BitLocker](#chapter-1-windows-security-eset-or-defender-and-bitlocker)
- [Chapter 2: LastPass and account security](#chapter-2-lastpass-and-account-security)
- [Chapter 3: VeraCrypt and Cryptomator](#chapter-3-veracrypt-and-cryptomator)
- [Chapter 4: NordVPN and Windows privacy](#chapter-4-nordvpn-and-windows-privacy)
- [Chapter 5: Malware recovery, VirusTotal, and wallet security](#chapter-5-malware-recovery-virustotal-and-wallet-security)
- [Chapter 6: Backups and everyday safety](#chapter-6-backups-and-everyday-safety)
- [Chapter 7: DNS filtering: Control D, NextDNS, or AdGuard Home](#chapter-7-dns-filtering-control-d-nextdns-or-adguard-home)
- [Chapter 8: Outbound firewall controls](#chapter-8-outbound-firewall-controls)
- [Chapter 9: Browser, router, and financial-device safety](#chapter-9-browser-router-and-financial-device-safety)
- [Chapter 10: Linux with Windows in a virtual machine](#chapter-10-linux-with-windows-in-a-virtual-machine)
- [Chapter 11: Final step: install software with WinGet](#chapter-11-final-step-install-software-with-winget)

---

## Chapter 1: Windows security, ESET or Defender, and BitLocker

**Recommended follow-up after installing Windows.** You can use the built-in protections without buying extra software. ESET is an alternative primary antivirus if you prefer it; BitLocker is included with Pro and Enterprise.

### 1. Choose one primary antivirus

I use **ESET** and recommend it as an option. Install it through [ESET's official site](https://www.eset.com/), activate it, update it, and leave its recommended real-time, behavioural, and reputation protections on. In Windows Security, check the listed security provider to confirm ESET is active. Follow its setup warnings and run an initial scan.

If you do not choose ESET, use **Microsoft Defender Antivirus**, which is already built into Windows. The controls below describe that path. Keep an active firewall—Windows Firewall, or the firewall supplied by your ESET edition—and the other compatible Windows protections enabled. Do not force two full antivirus products to run real-time scanning together. [Microsoft's antivirus compatibility guide](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-compatibility).

If the low VirusTotal detection count makes you question whether ESET would help, read [the explanation of installed protection versus a VirusTotal scan](#2-why-eset-if-so-few-engines-detected-the-trojan). That report cannot establish whether ESET would have prevented this theft.

### 2. Review Windows Security


Open **Settings → Privacy & security → Windows Security → Open Windows Security**. In Spanish Windows, search Start for **Seguridad de Windows**.

These are the main protections to review. Some controls appear only on compatible hardware or particular Windows versions. Enterprise activation alone does not set up a separately licensed, managed Defender for Endpoint service.

#### If Microsoft Defender is your antivirus

Open the virus/threat protection page, then its settings. Turn on:

- Real-time protection.
- Cloud-delivered protection.
- Automatic sample submission, if you accept sending suspicious samples to Microsoft for analysis.
- Tamper protection.

Check the exclusions list. Remove unfamiliar exclusions rather than excluding whole drives, Downloads, or wallet software. Update Defender’s protection information, then run a full scan. Review its protection history and resolve warnings; do not casually allow something it quarantined. [Microsoft’s antivirus settings guide](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/virus-and-threat-protection-in-the-windows-security-app).

These antivirus instructions apply if Microsoft Defender is your primary antivirus. If you choose ESET instead, check that Windows Security identifies ESET as the active provider and configure antivirus protection in ESET. Windows normally switches Defender Antivirus out of active protection when another registered antivirus takes over; do not force both to run real-time protection together. Other Windows Security controls remain relevant, but Defender-specific features such as Controlled folder access depend on Defender Antivirus being active and may be unavailable with ESET. [Microsoft's compatibility explanation](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-compatibility).

If suspicious behaviour persists, follow [the malware-recovery steps](#3-secure-accounts-from-a-clean-device). Defender's offline-scan option may not be available while another antivirus is the active provider.

#### Ransomware protection when Defender is active

1. From virus/threat protection, open the ransomware-protection settings.
2. Switch **Controlled folder access** on.
3. If you created D:, open the protected-folders list and add your actual personal-data folders there, such as `D:\Alex\Documents` and `D:\Alex\Pictures`, substituting your own folder name.
4. If a legitimate application is blocked from saving, verify the application before allowing that particular program through. Do not switch the entire protection off just to dismiss a warning.

This reduces unauthorized changes to protected folders; keep your disconnected backup as well. [Microsoft’s controlled-folder-access instructions](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/enable-controlled-folders).

#### Protection against suspicious apps and websites

Open **App & browser control**, then its reputation-based settings. Enable the available checks for:

- Suspicious applications and downloaded files.
- Microsoft Edge’s SmartScreen website/download protection.
- Potentially unwanted applications, including both app and download blocking where offered.
- Microsoft Store app web-content checking.
- Phishing protection and its available password-reuse/unsafe-storage warnings.

If **Smart App Control** is available, choose **On** for stronger application blocking. It checks application reputation and can block untrusted unsigned software even without a familiar malware detection. It can also block legitimate unsigned applications, and a valid signature is not a guarantee of harmlessness. Availability depends on configuration, including enterprise management and diagnostic-data settings. Microsoft lists disabling optional diagnostic data as a reason it can be off: this is a real privacy/security tradeoff. If you use it, preserve its required settings; if unavailable, do not use registry tricks to force it. [Microsoft's Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).

Leave the individual **Exploit protection** settings at their Windows defaults rather than forcing every mitigation on.

Password-reuse and unsafe-storage warnings depend on the Windows account and sign-in method; do not expect them to monitor every website password with the local account used in this guide. [Microsoft's phishing-protection requirements](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/enhanced-phishing-protection). Windows’ phishing controls do not recognize every wallet scam or protect every password you type. Keep your browser’s own security features enabled too. [Microsoft’s app and browser protection guide](https://support.microsoft.com/en-us/windows/security/windows-security/app-browser-control-in-the-windows-security-app).

#### Firewall

Open **Firewall & network protection**. If Windows Firewall is your provider, keep it on for all three profiles: domain, private, and public. If your ESET edition supplies the active firewall instead, check its protection in ESET; Windows Security may direct you there. Keep the active provider enabled and follow its compatibility guidance. On unfamiliar networks, use the public-network setting. Avoid allowing unexpected applications through the firewall. [Microsoft’s firewall guide](https://support.microsoft.com/en-us/windows/security/windows-security/firewall-and-network-protection-in-the-windows-security-app).

For optional outgoing connection prompts or stricter outgoing rules, see [Outbound firewall controls](#chapter-8-outbound-firewall-controls). Keep those advanced changes separate from this basic firewall check.

#### Sign-in protection

Open **Account protection** to review sign-in recommendations. Under **Settings → Accounts → Sign-in options**, set up Windows Hello if offered: a device PIN, fingerprint, or compatible face recognition. Keep access to your Windows account password too; a device PIN does not replace every recovery requirement. This is separate from the LastPass master passphrase policy in chapter 2. The available choices depend on the computer. [Microsoft’s sign-in options guide](https://support.microsoft.com/en-us/accounts-billing/security/sign-in-options-in-windows).

#### Device security

Open **Device security → Core isolation details**:

- Turn on **Memory integrity**.
- Turn on the vulnerable-driver blocklist if its switch is shown.
- Enable additional supported protections shown there, such as Local Security Authority protection or hardware-enforced stack protection, if available and compatible.
- Restart if requested, then check that the selected protections stayed on.

If an incompatible driver prevents this, get an updated driver from Windows Update or the hardware manufacturer. Avoid disabling protection simply to keep an unnecessary old utility. Confirm again that Secure Boot is enabled and the TPM is available. [Microsoft’s device security guide](https://support.microsoft.com/en-us/windows/security/windows-security/device-security-in-the-windows-security-app), [help with incompatible drivers](https://support.microsoft.com/en-us/windows/hardware/drivers/a-driver-can-t-load-on-this-device).

#### If you suspect another infection

Disconnect the computer from the network and stop using it for passwords or financial activity. From a clean device, secure affected accounts and revoke unfamiliar sessions. If Defender is active and its offline scan is available, save your work and open **Virus & threat protection → Scan options → Microsoft Defender Antivirus (offline scan) → Scan now**. Have your recovery key available before restarting. This restarts into a separate recovery environment to make some persistent threats harder to hide. Review **Protection history** afterwards. A clean result does not prove that previously stolen passwords or sessions are safe, and it is not a substitute for rebuilding a confirmed compromised system. [Microsoft's scan options](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/virus-and-threat-protection-in-the-windows-security-app).

### 3. Use a standard account for everyday work

1. Open **Settings → Accounts → Other users → Add account**.
2. Choose **I don’t have this person’s sign-in information**, then **Add a user without a Microsoft account**.
3. Create a separate account, such as `PCAdmin`, with a strong password. Keep this separate administrator password in your password manager or another secure place. It is not the password manager's master passphrase.
4. Select the new account in Other users, choose **Change account type**, and make it an **Administrator**.
5. Sign out and test signing in to that new administrator account.
6. While signed in as that administrator, return to Other users. Select your original everyday account, change its type to **Standard User**, and confirm.
7. Sign back in to your everyday account. Supply the separate administrator credentials when you deliberately install software or change protected settings.

Do not downgrade your everyday account until the separate administrator account works. [Microsoft’s user-account instructions](https://support.microsoft.com/en-us/windows/security/identity-signin/manage-user-accounts-in-windows).

### 4. Turn on BitLocker and keep recovery keys offline

**BitLocker protects stored data if someone steals the computer or removes its drive. It does not stop malware reading files on a drive that is already unlocked.** It also cannot undo a stolen wallet phrase. [Microsoft’s BitLocker overview](https://support.microsoft.com/en-us/windows/security/encryption/bitlocker-overview).

#### Encrypt C:

1. Open Start, search for **Manage BitLocker**, and open it.
2. Next to C:, choose **Turn on BitLocker**. If it already shows protection enabled, back up its recovery key instead of starting over.
3. When asked to save the recovery key, choose **Print the recovery key** or **Save to a file** on a separate USB. **Do not choose “Save to your Microsoft account” for this guide.** The recovery key is a 48-digit number.
4. Label the copy clearly with the computer name, C:, and the displayed key identifier. Keep **two readable copies in separate secure places**, such as a locked-away printout and a disconnected recovery USB. Do not keep the only copy on this computer or with the laptop when travelling.
5. On a previously used drive, choose **encrypt the entire drive** if offered; this also covers space containing deleted old files. Used-space-only encryption is suitable for a genuinely new drive. [Microsoft’s explanation of the two choices](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/planning-guide).
6. Choose the recommended/new encryption mode for an internal drive. Run the system check if offered, save your work, and restart when requested.
7. Keep the computer powered while encryption finishes. Check that protection is on and encryption is complete.

#### Encrypt D: too

If you created D:, encrypt it as well.

1. In the same BitLocker window, turn on encryption for D:.
2. Set a strong unlock password if prompted.
3. Save **D:’s own recovery key**, clearly labelled, separately from the computer.
4. If Documents, Desktop, and other everyday folders now live on D:, consider enabling **Automatically unlock on this computer** after C: is protected by BitLocker. This lets those folders work normally when you sign in. D: still has its own encryption and recovery key. If you instead leave automatic unlocking off, you must unlock D: before using those folders; get help arranging this if needed. For sensitive files you want to lock separately during the day, use the vault chapter below.

If encryption is already enabled, confirm that you have recovery keys for **both** drives and that protection is not suspended. If Windows reports a TPM problem, return to the hardware checks instead of making unfamiliar security-policy changes. [Microsoft’s BitLocker setup instructions](https://support.microsoft.com/en-us/windows/security/encryption/bitlocker-drive-encryption).

**Check that the saved recovery keys are readable before you put them away.** Without the necessary key, encrypted data may be unrecoverable. Unplug the recovery-key USB after saving it.

This is an **offline recovery-key policy**: whoever holds a working recovery key can unlock its drive. Automatic device encryption can back up keys when activated through a Microsoft or work/school account; that is why this guide disables automatic encryption in Rufus and enables BitLocker deliberately. Merely making an offline copy later does not undo a previous upload. If encryption was already enabled, establish where its keys were backed up before treating them as offline-only. [Microsoft's device-encryption explanation](https://support.microsoft.com/en-us/windows/security/encryption/bitlocker-overview).

Automatic unlocking is a convenience for this encrypted computer, not a barrier against malware running in your signed-in session. If the whole PC is stolen while powered off, C:'s protection also protects the stored automatic-unlock material. Keep D:'s separate recovery key for access after a reinstall. [Microsoft's BitLocker FAQ](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/faq).

For a separately lockable area, follow [VeraCrypt and Cryptomator](#chapter-3-veracrypt-and-cryptomator). Whole-drive encryption and a vault cover different situations and can be used together.


### 5. Check the result

- [ ] One primary antivirus is active and updated; unfamiliar exclusions are removed.
- [ ] The firewall, reputation checks, and compatible device protections are on.
- [ ] If Defender is active, Controlled folder access covers the real personal folders on D: as well as the default folders.
- [ ] Everyday use is under a standard account; the separate administrator account has been tested.
- [ ] C: and any D: are encrypted with protection on, not merely suspended.
- [ ] Each drive's recovery key has two readable copies stored securely offline, separate from this PC.

**Do not back up the BitLocker recovery keys to a Microsoft account for this setup.** Keeping them offline limits access through online accounts and keeps the recovery material under your control. Anyone holding a valid recovery key can use it to unlock the matching drive, so protect your offline copies carefully too.

---

## Chapter 2: LastPass and account security

**Optional choice of product; strongly recommended account practices.** Use one password manager well. This chapter gives a detailed LastPass setup because it is the one I have used for about ten years. I have found it useful and reliable in everyday use, while recognising that it has had serious security incidents. That personal experience is why I recommend considering it.

The goal is simple: **one long master passphrase that you remember, and a different randomly generated password for every other account.** You should not need to remember those site passwords or reuse them.

**First session:** secure email, create the vault, enable multifactor authentication and automatic logout, and arrange recovery. Then replace important reused or exposed passwords. Country restrictions, extra hardware-key methods, and monitoring can be a second session; you do not have to learn every LastPass feature at once.

### 1. Choose your password manager

| Option | Why consider it? | What to check |
| --- | --- | --- |
| [LastPass](https://www.lastpass.com/) | Cloud-synced vault, password generation, login controls, and a security dashboard; the detailed example here | Check which subscription includes the hardware-key and monitoring features you want |
| [Bitwarden](https://bitwarden.com/pricing/) | Free core password management and encrypted syncing | Some advanced authentication and other features depend on plan |
| [1Password](https://1password.com/product/password-manager) | Paid password management with account and family features | Understand its Secret Key and recovery arrangements |
| [KeePassXC](https://keepassxc.org/) | Free local encrypted password database under your control | You arrange safe backups and any syncing yourself |

You do not need to dismiss a product because someone says it “sucks,” or choose it only because I use it. Consider the features, security history, and setup you can maintain. [LastPass's current plans](https://www.lastpass.com/pricing/) list what is included; availability can change.

### 2. Secure your email first

Your email receives login verification and account recovery messages. From a clean device:

1. Give the email account a fresh, unique password.
2. Add a passkey or hardware security key if supported; otherwise enable an authenticator app.
3. Remove unfamiliar recovery addresses, phone numbers, forwarding rules, connected apps, and sessions.
4. Keep the email provider's recovery codes securely offline and separate from the computer.

Do not leave email recovery dependent entirely on the password vault you may be trying to recover. Plan a way back into email if the PC or phone is lost.

### 3. Create LastPass on the rebuilt, updated computer

1. Open [LastPass's official website](https://www.lastpass.com/) yourself and choose its account-creation option.
2. Use your secured email address and complete verification.
3. Create a **long, unique master passphrase**. A useful approach is six or more randomly chosen, unrelated words, making a phrase you can memorise. Avoid quotations, song lyrics, personal facts, and a phrase you have used anywhere else.
4. **Memorise the master passphrase. Never write it down or store it anywhere**—including a note, photograph, email, browser password store, or another vault. This is the approach I use and recommend here.
5. Practise typing it correctly, then again later, before relying on it for all your accounts. Do this only on a trusted device, away from people and cameras.
6. Follow the official site's link to the LastPass extension for your browser. Install the genuine extension from the linked browser store, pin its icon if helpful, and sign in.

There is a real recovery tradeoff to never recording the master passphrase: forgetting it can mean losing the vault if a previously configured recovery method is unavailable. Set up recovery before you need it; email access alone does not guarantee recovery.

### 4. Add multifactor authentication

Do this while you still have access to the vault and your email:

1. Open the LastPass vault and **Account Settings → Multifactor Options**.
2. Choose a supported authenticator, such as **LastPass Authenticator**, and click its edit/pencil control.
3. Enable it and follow the pairing instructions on your phone. Install the phone app only through the official store link.
4. Finish the confirmation and save the setting.
5. Sign out and back in to check that your master passphrase and the second factor work.

Approve a push notification only when **you** just started that sign-in. Never read a one-time code to a caller. Keep the phone updated and screen-locked. [LastPass's authenticator setup instructions](https://community.lastpass.com/kb/articles/30-set-up-lastpass-to-use-the-lastpass-authenticator-app%EF%BB%BF).

#### Add hardware keys where your account supports them

LastPass has different hardware-key methods, so check which one you are setting up:

- **YubiKey one-time-password authentication:** select the supported YubiKey option under Multifactor Options and enrol the keys following its wizard. This is a paid-plan feature; LastPass documents up to five OTP keys, allowing a securely stored spare.
- **FIDO2/passwordless access:** use LastPass's separate passwordless-access setup if offered for your plan and device. Follow its current device and recovery requirements. Do not assume the number of spare keys or mobile support matches the OTP method.

Both can provide useful additional protection. **An OTP method is not the same as phishing-resistant FIDO2/WebAuthn authentication**, even if the same physical YubiKey supports both. You still need to remember your master passphrase for account tasks and recovery. [LastPass's YubiKey options](https://www.lastpass.com/solutions/authentication/yubico), [passwordless access](https://www.lastpass.com/solutions/passwordless-access), [Yubico's FIDO documentation](https://docs.yubico.com/hardware/yubikey/yk-tech-manual/yk5-apps-fido.html).

For your email, exchange, and other important accounts, register **two hardware security keys** if that service supports multiple keys. Test the spare and keep it somewhere secure, separate from the everyday key. These are registrations on each service; protecting LastPass does not automatically enable MFA on all the sites in your vault.

### 5. Make the vault log out promptly

1. Open the browser's **LastPass extension → Account → Extension settings**, or its Preferences equivalent.
2. Enable **Log out after this many minutes of inactivity** and start with **10 minutes**.
3. Enable **Log out when all browsers are closed**, if offered.
4. In the vault's **Account Settings → General → Show Advanced Settings**, set **Website Auto-Logoff** to a short interval too.
5. If you see **Disable Auto-logoff**, leave it **off**. Enabling it overrides the other automatic logout settings.
6. Test by closing all browser windows and by waiting through the inactivity interval. Reopen the vault and confirm you must authenticate again.

Extension settings can be local to each browser, so repeat this wherever you use LastPass. Avoid “remember me for weeks” or permanent trusted-browser exemptions for the second factor. Press **Windows + L** when stepping away; do not assume locking Windows has logged out every browser extension. [LastPass extension settings](https://community.lastpass.com/discussion/5057/manage-lastpass-browser-extension-preferences), [inactivity setting](https://community.lastpass.com/discussion/2584/why-doesnt-lastpass-time-out-after-so-long-like-the-banking-websites-do), [release notes for Disable Auto-logoff](https://lastpass.com/releasenotes.php).

#### Keep signed-in devices to a minimum

My preference is to use as few signed-in devices as possible, ideally only the everyday device I need. Sign out of unused installations, remove obsolete trusted devices, and review your account's available device/session controls. After a suspected compromise, revoke other sessions and trusted-device exemptions using the current account controls or official support guidance.

**A list of verified devices is not a guarantee that only one physical device can be logged in.** Do not confuse a Free plan's “one device type” allowance with a one-device security limit. If your current account offers a control to disallow concurrent sessions, enable it and test it on your own devices; do not assume it exists or covers every app. Short automatic logout still helps reduce exposure.

### 6. Restrict logins by country

Where your account offers it, open **Account Settings**, expand the advanced settings, and look for **Country Restrictions** or the option to allow login only from selected countries. Allow your normal country and only the others you deliberately need. Save and test before signing out everywhere. If that setting is not present, consult LastPass's current account-security help rather than applying a Business administrator policy to a personal account.

This is a useful extra filter: an unexpected login from elsewhere can be rejected. An attacker does not necessarily know your country, but could infer it from stolen account information or simply try several VPN locations. That leaves a concrete benefit—another condition a remote login must satisfy—without treating geography as proof of identity.

If you use **NordVPN**, allow the country of the VPN server you actually use. Before travelling or changing VPN countries, update the allowed list from a trusted session. A VPN can make a legitimate login appear to come from another country. [LastPass's account-security help](https://community.lastpass.com/categories/new-to-lastpass/p1) includes its country-restriction login guidance; business accounts have separate administrator controls.

### 7. Keep email verification of unfamiliar logins

LastPass may ask you to validate a device or location by email. Its documented triggers include a new device or IP/location and a previously used device that has not been used for **more than 60 days**. This is useful additional checking, including for an older device returning to use. Keep it enabled and protect the receiving email account.

Approve only a login **you just attempted**, after checking the device and location. If an unexpected message arrives, open LastPass through your bookmark to review the situation. Do not follow a suspicious message's link or approve a request to make an alert disappear. Location information can be approximate, especially with a VPN. [LastPass's explanation of verification emails](https://community.lastpass.com/kb/articles/19-verify-your-login-attempt%EF%BB%BF).

### 8. Replace reused or exposed site passwords

Do this on the clean system. Start with email and financial accounts, then work through the rest:

1. Open the genuine website through a checked bookmark.
2. Find its password-change page.
3. Use the LastPass password generator to create a **new random password**, ideally **20 or more characters** if the site accepts it. Use the site's permitted character set.
4. Save it against the correct website address in LastPass and complete the site's change.
5. Test the new login before leaving the account.
6. Enable that site's own passkey, security key, or authenticator, then revoke unfamiliar sessions and connected apps.

Never reuse these passwords, and do not try to memorise them. Turn off the browser's separate offer to save passwords if you want one clear place to manage them. Avoid automatic form submission; check the website before filling a login. If the vault refuses to match the domain you expected, stop and inspect the address.

Do not restore an old compromised browser profile or import a list of stolen passwords and assume the problem is fixed. Saving an existing password in a manager does not change it at the website. Keep wallet recovery words out of the vault and offline instead.

### 9. Turn on exposure monitoring and act on alerts

Open **Security Dashboard**. Review weak or reused passwords and enable **Dark Web Monitoring** for the email addresses supported by your plan. Complete any verification and enable notifications. Use this as a periodic task, not just a score to admire. [LastPass's dashboard features](https://www.lastpass.com/features/security-dashboard).

For an alert:

1. Open the affected service directly, rather than the link in an alarming message.
2. Change the affected password to a fresh generated one. Change it anywhere else it was reused.
3. Revoke other sessions, inspect recovery details, and confirm MFA is enabled.
4. If the exposure concerns a card or financial account, contact the provider through its official app or known number.

Alerts help you respond to information discovered in monitored sources. They do not mean every leak will be found or that the alert service stopped the original theft. LastPass and NordVPN monitoring may overlap; you do not need to buy several subscriptions for the same feature.

### 10. Set up recovery without recording the master passphrase

While everything works:

1. Review LastPass's current **Account Recovery** options.
2. If you use its mobile app and choose biometric account recovery, enable it in advance and verify the app's recovery status. Protect the phone's screen lock.
3. Keep a trusted browser installation available if relying on desktop recovery. Clearing browser data or reinstalling the PC can remove its locally stored recovery material.
4. Keep access to the secured recovery email, a tested spare authentication method, and any issued recovery codes. Store those codes securely offline, separate from this computer. **They are not a written copy of the master passphrase.**
5. Understand which recovery route will still work if both the PC and phone disappear. If none will, acknowledge that risk before putting everything in the vault.

Desktop recovery depends on recovery material created by a previous sign-in; mobile recovery must have been enabled. LastPass support cannot simply tell you the master passphrase or guarantee a reset that preserves the vault. Do not erase a working trusted device until you understand your recovery position. [LastPass's recovery explanation](https://community.lastpass.com/discussion/5020/lastpass-account-recovery).

If exporting a vault for a backup or move, check the format: a plain CSV export exposes passwords. Do not leave one in Downloads, email it, or put it into ordinary cloud storage. Get help making a properly encrypted backup if you need an export.

### 11. Understand the security history once, then maintain the setup

LastPass disclosed that attackers stole customer vault backups in its **2022 incident**, including encrypted fields and some unencrypted information such as website URLs. That was a serious breach and belongs in an informed choice of provider. [LastPass's incident disclosure](https://blog.lastpass.com/posts/notice-of-security-incident).

Country restrictions, email checks, and MFA help protect **online sign-in**. An attacker with a stolen encrypted vault copy can instead try guessing its master password offline. A strong master passphrase matters there; changing today's master passphrase does not change a copy already stolen. If an old vault or this PC was exposed, rotate the actual site passwords and revoke sessions as well.

The useful daily routine is: keep the extension and apps updated, use generated unique passwords, leave authentication and login checks on, review alerts, and keep the vault logged out when finished. Those are practical layers of protection, rather than a promise that any provider can prevent every attack.

### LastPass setup checklist

- [ ] My unique master passphrase is memorised and is never written or stored anywhere.
- [ ] The recovery email is secured and has a recovery route independent of the vault.
- [ ] MFA works, and a supported spare authentication method has been tested.
- [ ] Short automatic logout works in every browser I use; Disable Auto-logoff is off.
- [ ] Unused devices/sessions are removed; I do not confuse device verification with a one-device limit.
- [ ] Country restrictions, if available, match my normal connection and VPN country.
- [ ] Unfamiliar-login email checks remain enabled.
- [ ] Important accounts have fresh unique passwords and their own strong authentication.
- [ ] Monitoring is configured, and I know what to do with an alert.
- [ ] Recovery prerequisites are understood before I wipe or replace a trusted device.

---

## Chapter 3: VeraCrypt and Cryptomator

**Optional extra protection for sensitive files.** BitLocker encrypts the drives; a separately locked vault lets you keep selected files locked even while using the rest of Windows. Both tools below have free Windows desktop versions for personal use.

| Tool | Good fit | Official download |
| --- | --- | --- |
| VeraCrypt | A local encrypted container that appears as an extra drive when opened | [VeraCrypt downloads](https://veracrypt.io/en/Downloads.html) |
| Cryptomator | Encrypted folders, particularly for files synchronised through cloud storage | [Cryptomator downloads](https://cryptomator.org/downloads/) |

Choose one to begin with. You do not need both. Cryptomator's mobile apps have different licensing arrangements; the Windows desktop app is free. [Cryptomator's pricing and licence information](https://cryptomator.org/pricing/).

### 1. Make a standard VeraCrypt container

Install from the official download and start with a small test container:

1. Open VeraCrypt and choose **Create Volume**.
2. Select **Create an encrypted file container → Next**.
3. Select **Standard VeraCrypt volume → Next**.
4. Choose **Select File**, then a new filename such as `D:\PrivateFiles.hc`. Use C: if needed. Never select a file you need to keep.
5. Keep the recommended encryption/hash defaults and choose a container size.
6. Set a long, unique container password, separate from your master passphrase. Your password manager can hold this one.
7. Follow the remaining prompts, including mouse movement, and format the **container file**, not an existing disk or partition.

[VeraCrypt's beginner tutorial](https://veracrypt.io/en/Beginner%27s%20Tutorial.html).

To use it:

1. In VeraCrypt, select an unused drive letter, for example **V:**.
2. Click **Select File** and select the container.
3. Click **Mount** and enter its password.
4. In File Explorer, open V: and put sensitive files **inside that drive**.
5. Save and close the files when finished. In VeraCrypt, select the mounted volume and click **Dismount**.

Do not delete the `.hc` container: it holds the encrypted files. Check the copy inside the vault before removing an ordinary copy. Previously stored plaintext can survive in backups, temporary files, or deleted space; moving a file into a vault does not erase every older copy. [VeraCrypt's security model](https://veracrypt.io/en/Security%20Model.html).

#### Enable automatic dismounting

Open **Settings → Preferences** and review **Auto-Dismount**:

- Enable dismounting when the session locks or the user logs off, where offered.
- Set an inactivity timeout, such as **10 minutes**.
- Keep VeraCrypt's **background task enabled and running**.
- Avoid password caching; enable clearing cached passwords on dismount if shown.

Save and close all test documents, press **Windows + L**, sign back in, and check that V: is gone and requires mounting again. Test the idle timeout too. Open files or active programs can prevent a clean dismount; close them first instead of forcing a dismount during writes. [VeraCrypt's background task and auto-dismount settings](https://veracrypt.io/en/VeraCrypt%20Background%20Task.html).

### 2. Or create a Cryptomator vault

1. Install Cryptomator from its official website and open it.
2. Choose **Add vault → Create new vault**.
3. Give it a name and choose its storage folder. For local storage, use a suitable folder on D: or C:. For cloud syncing, choose a folder inside the cloud service's synced area.
4. Set a long, unique vault password and keep its recovery key securely offline. Use the wizard's recovery-key option if offered, or create it through the vault's management options afterwards.
5. Unlock the vault and choose **Reveal Drive**. This is the decrypted view where you put and edit documents.
6. Save a harmless test file there, close it, and click **Lock** in Cryptomator.
7. Unlock it again and confirm the test file is intact.

Do not manually rename or edit the scrambled files in the underlying encrypted folder. For cloud storage, let the cloud app finish syncing before using the vault on another device. Avoid editing the same file from several devices at once. [Creating a Cryptomator vault](https://docs.cryptomator.org/desktop/adding-vaults/), [accessing its files](https://docs.cryptomator.org/desktop/accessing-vaults/).

#### Enable automatic locking

Lock the vault, open **Vault Options**, and enable **Lock when idle for**, starting with **10 minutes**. Leave automatic unlocking at startup off. Close files and test that the timeout really locks the vault. If a lock-on-session-lock option exists in your version, configure and test it separately; do not assume Windows + L automatically locks every vault. [Cryptomator's vault settings](https://docs.cryptomator.org/desktop/vault-management/).

### 3. Keep the protection useful

- Open the vault only when you need it, and lock it afterwards.
- Use a different password from Windows and the master passphrase.
- Keep temporary working copies and exports out of ordinary folders where practical.
- Back up the encrypted container or vault **while it is locked**; test a restore using a copy.
- Keep BitLocker on as well if you want protection for the rest of the drive.

Automatic locking reduces the time sensitive data is accessible. While a vault is open, malware running as you may read its contents or capture its password. Use vaults on a clean, maintained system. [VeraCrypt's security model](https://veracrypt.io/en/Security%20Model.html), [Cryptomator's security model](https://docs.cryptomator.org/security/security-target/).

### 4. Advanced VeraCrypt option: hidden volumes

A VeraCrypt hidden volume can use one password for an outer volume containing ordinary/decoy files and a different password for hidden contents. The outer password opens real outer contents; it is not simply a universal “fake password” switch. This can serve a specialised privacy purpose and is **not a second authentication factor**.

Writes to an outer volume can destroy the hidden contents if hidden-volume protection is not used correctly. Start with a standard container and have an experienced helper explain hidden volumes, backups, and the relevant limitations before trusting important data to one. Cryptomator does not provide this same outer/hidden-volume arrangement. [VeraCrypt hidden volumes](https://veracrypt.io/en/Hidden%20Volume.html), [hidden-volume protection](https://veracrypt.io/en/Protection%20of%20Hidden%20Volumes.html).

---

## Chapter 4: NordVPN and Windows privacy

**Optional.** You can keep the standard Microsoft image and adjust privacy settings afterwards. A custom NTLite image is not required. Start with the built-in Windows settings; add a VPN or other tools if their features fit what you want.

### 1. Decide what you want NordVPN to do

NordVPN is a paid option I suggested because it can combine several features. Check the **plan and Windows app support** before paying; not every advertised feature is included in every subscription or platform.

| Feature | Practical use |
| --- | --- |
| VPN connection | Encrypts the connection between your PC and the VPN service and changes the public IP address sites see |
| Country/server selection | Lets you choose where your connection exits; useful for location needs and coordinating LastPass country restrictions |
| Malicious-site, ad, and tracker filtering | Can block known harmful destinations and reduce unwanted tracking/advertising |
| Dark Web Monitor | Alerts you when monitored personal information appears in sources the service covers |
| Additional malware/download and vulnerability tools | May flag harmful downloads or known vulnerable installed applications, depending on plan and platform |

The provider becomes another party you trust with your connection. HTTPS still matters. A VPN does not make a compromised Windows session safe, and routing through a different country does not inherently make an account login more secure. [NordVPN's feature overview](https://nordvpn.com/features/).

### 2. Install and connect

1. Open [NordVPN's official Windows download page](https://nordvpn.com/download/windows/) and download its installer.
2. Run the installer, approve the expected Windows permission prompt, and follow the steps.
3. Decline extra browser extensions or NordPass if you do not need them. If you chose LastPass, you do not need a second password manager just because an installer offers it.
4. Launch NordVPN, choose **Log In**, and complete sign-in through the official Nord Account page it opens.
5. Allow the browser to return you to the NordVPN app.
6. Use **Secure my connection**, **Quick Connect**, or the equivalent connection button. Confirm it says **Connected**.
7. For everyday use, choose a nearby country/server that works with your account's permitted countries. You can deliberately choose another country when needed.

Keep default connection/protocol choices unless you have a reason to change them. If you want it used routinely, turn on **Launch at Windows startup** and **Auto-connect**. [NordVPN's Windows installation and settings guide](https://support.nordvpn.com/hc/en-us/articles/19472023025169-How-to-install-and-use-the-NordVPN-app-on-Windows).

#### Optional Internet Kill Switch

Open **Settings → Kill Switch** and enable **Internet Kill Switch** if you want internet blocked whenever the VPN protection is unavailable. Read the app's exact behaviour: it can intentionally leave you without internet until the VPN reconnects or you change that setting. Remember this when troubleshooting a connection.

Keep a stable usual VPN country for LastPass country restrictions. Travelling or switching exit countries may trigger legitimate device/location checks; approve only the sign-ins you actually started.

### 3. Enable the filtering you want without piling up antivirus

Open the app's **Protection** page, usually the shield icon. Current versions and plans may use names including **Real-time protection**, **Next-gen antivirus**, or the older **Threat Protection / Threat Protection Pro** labels. Read the description beside each switch; the names have changed over time.

Enable available malicious-site, scam/phishing, ad, and tracker filtering you want. Some DNS-based protection requires an active VPN connection. More extensive Windows download scanning, quarantine, and vulnerability features depend on the product/plan. [NordVPN's explanation of its protection levels](https://support.nordvpn.com/hc/en-us/articles/19508765521425-What-is-NordVPN-s-Next-gen-antivirus).

**If ESET is your primary antivirus, keep it as the primary antivirus.** Start with NordVPN's VPN, monitoring, and compatible web-filtering functions. Do not automatically enable an additional full real-time antivirus layer without checking the vendors' current compatibility guidance. If the app cannot separate the features you want from overlapping malware scanning, leave that bundle off until you have advice for that exact setup.

If your plan includes the Windows **Vulnerability scanner**, review its findings and update the named applications through their official updater. It is an alert to patch software, not a promise that it fixed it. [NordVPN's Windows vulnerability scanner](https://support.nordvpn.com/hc/en-us/articles/39750705561361-Vulnerability-scanner-by-NordVPN-for-Windows).

Read any cloud-scanning setting before enabling it: submitting files to an online scanner has a privacy consequence. Never deliberately upload a wallet file, recovery phrase, password export, or confidential document for a public verdict. [NordVPN's cloud-based scanner explanation](https://support.nordvpn.com/hc/en-us/articles/39640156149009-What-is-the-Cloud-based-threat-scanner-by-NordVPN).

If you also choose Control D, NextDNS, or AdGuard Home, follow the [DNS filtering chapter](#chapter-7-dns-filtering-control-d-nextdns-or-adguard-home) and check which resolver is active with NordVPN connected and disconnected. Browser and VPN settings can change the DNS service in use; confirm the intended filtering rather than assuming all installed tools apply together.

### 4. Set up Dark Web Monitor

1. Open **Dark Web Monitor** in the NordVPN app and choose **Start monitoring** if shown.
2. To add a supported email address, open **Manage assets → Add email** and complete the verification code sent there.
3. Enable notifications and review the **Alerts** view.
4. Additional monitored asset types, such as a phone number, depend on plan and region. Add only information you want the service to monitor.

For a credible alert, go directly to the affected service, generate a new password, revoke other sessions, and check its MFA and recovery settings. If payment information is involved, contact the financial provider directly. LastPass and NordVPN monitoring can overlap; choose what you find useful rather than buying every overlapping feature. [NordVPN's monitoring setup guide](https://support.nordvpn.com/hc/en-us/articles/19681938685713-How-to-use-the-NordVPN-Dark-Web-Monitor-or-Dark-Web-Monitor-Pro-feature).

### 5. Adjust Windows privacy and unwanted features


You can keep the standard Microsoft installation and adjust its built-in privacy controls. These steps reduce optional collection or unwanted features; they do not make a Trojan harmless:

1. Open **Settings → Privacy & security**. Under **Recommendations & offers**, **Personalized offers**, or **General**, depending on version, turn off advertising personalization, suggested content, and activity-based offers you do not want. [Microsoft's privacy controls](https://support.microsoft.com/en-us/windows/privacy/general-privacy-settings-in-windows), [newer offers settings](https://support.microsoft.com/en-us/windows/privacy/privacy-settings-for-recommendations-offers-in-windows-11).
2. Review **Diagnostics & feedback**. Turn off optional data sharing you do not need **unless it is required for Smart App Control you chose to use**. Keep Defender's cloud-delivered protection and SmartScreen enabled; these are security services, with their own data use.
3. Review app permissions for location, microphone, and camera. Allow access only where you need it.
4. If you do not want the Copilot app, open **Settings → Apps → Installed apps → Copilot → … → Uninstall**. Removing this app does not remove every AI feature from Windows, Edge, or Office. [Microsoft's uninstall instructions](https://support.microsoft.com/en-gb/microsoft-365-copilot/what-is-microsoft-copilot-app?nochrome=true).
5. If **Recall & snapshots** exists on your PC, leave snapshot saving off. If it was enabled, turn it off and use its settings to delete existing snapshots. The feature is hardware-dependent and requires opting in; not every PC has it. [Microsoft's Recall controls](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall).

A custom image is optional. A standard, maintained Windows installation can use these protections. If a helper customizes an image later, preserve Windows Update, Defender, recovery tools, and application compatibility, and test it before relying on it.

### 6. Further reading: The Privacy Cookbook

For a deeper look, explore [The Privacy Cookbook](https://theprivacycookbook.com/), starting with [Threat Modeling](https://theprivacycookbook.com/start-here/threat-modeling/). It is an independent resource. Pick the problems relevant to you—tracking, account theft, physical loss, or unsafe downloads—then make changes you understand. This is a broad subject; you do not need to apply every suggestion in one evening.

### 7. Finish with O&O ShutUp10: OOSU10.exe

**Optional Windows privacy utility.** [O&O ShutUp10](https://www.oo-software.com/en/shutup10), also known from earlier releases as ShutUp10++, puts many Windows privacy and unwanted-feature switches in one place. Its free portable version is enough to review and apply settings manually.

1. Open [O&O's official download page](https://www.oo-software.com/en/download/current/ooshutup10).
2. On the Intel/AMD PC covered by this guide, click **Download now (64-bit)**. Save **OOSU10.exe**. An ARM version is for different hardware.
3. Run the file. It is portable; there is no ordinary installation wizard.
4. Use its **Actions** menu to create a **system restore point** before changes. If Windows says System Protection is disabled, enable it for C: and create the restore point first. A restore point helps undo settings; keep your separate file backup too.
5. Use the **File** menu's export/configuration option, where available, to save the current settings before changing them.
6. Read the descriptions and recommendation rating for individual settings. Start with settings marked **recommended**, selecting only the changes you actually want. Avoid “apply everything.”
7. If a setting needs administrator access, use the app's restart-as-administrator option and your separate administrator credentials.
8. Restart if requested, then check updates, Windows Security, your browser, and sign-in methods still work.

Preserve **Windows Update, Defender/ESET protection, SmartScreen, needed security-cloud services, and the hardware-key/Windows Hello features you use**. If you chose Smart App Control, preserve the diagnostic settings it requires. Disabling every service that communicates online can also disable protections you wanted. Review Copilot/AI, advertising, suggested content, and permissions individually.

If a change breaks a feature, reopen the tool and undo that setting or import your saved configuration. Review settings again after a major Windows update. The free tool is for changes you review yourself; you do not need paid background enforcement to follow these steps. [O&O's first-steps manual](https://manuals.oo-software.com/ooshutup10/en/docs/first-steps/), [free and premium support information](https://www.oo-software.com/en/shutup10/support).

---

## Chapter 5: Malware recovery, VirusTotal, and wallet security

**Additional reading for a suspected compromise.** The Windows reinstall is in the main guide. These steps address information an attacker may already have taken. If theft is ongoing, deal with account and wallet access from a trusted device immediately; this chapter's optional placement does not make that response unimportant.

### 1. “Very few VirusTotal engines detected the Trojan—what now?”

A small detection count is not proof that a file is safe. New or modified malware may be missed; isolated detections can also be false positives. In this situation, the suspected Trojan plus the wallet theft is a reason to treat the machine as compromised, rather than waiting for a majority of scanners to agree.

Keep the existing report link, scan date, and file hash if available. Do not run the file again to test it. Do not upload private wallet files, recovery words, password databases, or documents to a public scanner. Standard VirusTotal submissions can be shared with security partners; private scanning is a separate service. [VirusTotal's explanation of verdicts](https://docs.virustotal.com/docs/false-positive), [private versus standard scanning](https://docs.virustotal.com/docs/private-scanning).

### 2. Why ESET if so few engines detected the Trojan?

I use ESET and recommend it as an option because of its overall protections and my experience with it. **That does not establish that it would have stopped this particular theft.** We do not have the sample or its report here to assess what ESET detected at the relevant time.

A VirusTotal file verdict is different from the full antivirus product running on your PC. Installed ESET includes layers such as behavioural monitoring, memory scanning, and exploit protection. A file-scanning engine's verdict does not reproduce all those layers or the circumstances in which a program runs. These additional protections can help even where a simple file scan misses a threat. [ESET's protection layers](https://help.eset.com/essp/18/en-US/idh_hips_main.html).

If ESET's engine said **Undetected** in that report, acknowledge the miss in that scan. A later detection does not prove it would have blocked the original attack. VirusTotal specifically cautions against using its engine counts to rank complete antivirus products. [VirusTotal's comparison limitations](https://docs.virustotal.com/docs/antivirus-stats).

The practical response is to use **one updated primary antivirus**, either ESET or Defender, then add the Windows, account, software, and backup protections described in the other chapters. The Windows Security chapter shows both paths. A choice of antivirus alone does not invalidate stolen sessions, replace a leaked wallet phrase, or stop a person being tricked into approving a payment.

### 3. Secure accounts from a clean device


Disconnect the suspect computer from the internet. Use a trusted phone or another clean computer to secure your email and financial accounts: change passwords, sign out other sessions, remove unfamiliar recovery methods, and enable an authenticator, passkey, or security key where available. Review exchange API keys and revoke unfamiliar ones.

**A Windows reinstall does not make a stolen wallet recovery phrase safe again.** Anyone with that phrase can control its wallet. If it may have been exposed, create a completely new wallet with a new recovery phrase on a trusted device and arrange to move remaining assets safely. Creating another account inside the old wallet may reuse the same compromised phrase. Stop sending money to the affected wallet. [Wallet provider guidance on unauthorized transactions](https://www.exodus.com/support/en/articles/8598870-i-noticed-an-unauthorized-transaction-in-my-exodus-wallet-what-should-i-do-next).

Before wiping the computer, preserve transaction IDs, public wallet addresses, and other evidence you may need. Make sure you have safe access to essential account recovery information. Do not erase your only copy of information needed to recover remaining assets.

Work through this order:

1. **Main email:** change its password, review forwarding rules and recovery information, revoke other sessions, and enable a passkey/security key or authenticator.
2. **Password manager:** if it was used on the infected PC, assume its unlocked contents may have been exposed. Secure the manager account from a clean device and rotate the actual important site passwords too.
3. **Banks and exchanges:** contact their official support where necessary; review withdrawals, authorised devices, API keys, withdrawal addresses, and recovery settings.
4. **Other accounts:** change exposed or reused passwords, revoke sessions, and remove unfamiliar apps or extensions.
5. **The computer:** prepare the USB on a clean machine, back up selected data, and use the initial clean-install procedure in the main guide.

Changing a password does not necessarily revoke every existing login token. Use each service's explicit sign-out/revoke-session controls as well. Download fresh applications and add back only needed browser extensions. A clean scan after the reinstall cannot establish that secrets stolen earlier are safe.

### 4. Protect the replacement wallet


Antivirus and disk encryption help secure the computer. Your wallet still needs its own precautions:

1. If the old recovery phrase may be compromised, use a **new wallet with a newly generated phrase**, created on a trusted device. Changing the old wallet’s app password does not replace its underlying keys.
2. Consider a hardware wallet bought directly from its manufacturer or an authorized seller. Initialize it yourself; never use recovery words supplied on a prewritten card.
3. Follow that manufacturer’s backup procedure. Keep the recovery words offline and private. Do not store them in screenshots, email, cloud storage, or a file on C: or D:.
4. For a hardware wallet designed for on-device recovery, enter recovery words only on the hardware device. Never type them into a website, chat, or a supposed support form.
5. Verify the full receiving address and transaction details on the hardware wallet’s own screen. Reject transactions or approvals you do not understand. A hardware wallet cannot save you from every transaction you choose to approve.
6. Download wallet software through the wallet maker’s official website. Bookmark the genuine site; avoid sponsored search results and unsolicited “support” messages.

[Hardware wallet manufacturer guidance on phishing and backups](https://trezor.io/learn/security-privacy/personal-security-standards/scams-and-phishing). These principles apply even if you choose a different manufacturer; follow your device’s specific instructions.

For a valuable wallet, consider keeping the signing device and wallet activity separate from ordinary downloads, experiments, and remote-support sessions. A dedicated, updated device used only for financial activity can make habits easier to control. Test a small transfer first when moving to a replacement wallet, and verify the destination on the hardware device where applicable.

Do not accept unsolicited “recovery” help. No support person needs your recovery phrase. Keep records of the theft and use the relevant exchange/provider and local reporting channels; do not pay an advance fee to someone promising guaranteed recovery.

---

## Chapter 6: Backups and everyday safety

**Optional follow-up chapter with strongly recommended habits.** You do not need to install every security tool. A repeatable routine is easier to maintain than a collection of settings you no longer understand.

### 1. Keep a backup you can restore

The optional D: partition makes later Windows reinstalls convenient. It is still on the same physical disk, and malware can reach it while it is accessible. Keep a separate copy.

A simple weekly routine:

1. Connect the separate backup drive deliberately, when Windows appears healthy.
2. Copy changed personal files from their actual locations, including `D:\Alex` if you moved folders there. Include important project/application data still stored on C:.
3. Keep older versions where possible, rather than allowing a damaged file to replace your only good copy.
4. Open several backed-up files. Occasionally restore a sample to a different folder and verify it works.
5. Safely eject and unplug the backup drive when finished.

Keep a second copy of irreplaceable files in a separate secure place. Encrypt sensitive backups, and keep the required recovery keys separate from the PC. If losing a week's work would hurt, back up more often.

For VeraCrypt or Cryptomator, close files and **lock the vault before backing up its encrypted contents**. Keep enough older versions to recover from a damaged or accidentally deleted vault. Test using a restored copy before you depend on it.

Cloud sync can be useful as another copy, especially with version history, but check its restore options. A deletion or ransomware change may sync too. A restore point is for some system changes; it is not a backup of all your documents.

### 2. Prefer passkeys and hardware security keys for important accounts


In your email and financial account's **Security** settings, add a **passkey** or **FIDO security key** if supported. These provide phishing-resistant sign-in. For especially important accounts, two registered hardware security keys let you keep one securely as a spare. Otherwise, use an authenticator app; avoid relying only on text messages when stronger choices exist. Keep recovery codes offline. Never approve an unexpected sign-in prompt or give a caller a one-time code. [CISA's explanation of phishing-resistant authentication](https://www.cisa.gov/sites/default/files/2023-01/fact-sheet-implementing-phishing-resistant-mfa-508c.pdf).

### 3. Make scams harder to act on

- Bookmark the genuine email, bank, exchange, and wallet sites after checking their addresses. Open those bookmarks to sign in rather than links in messages or sponsored search results.
- Treat requests to **paste a command**, disable antivirus, install an extension, scan a sign-in QR code, or share your screen as a reason to stop and verify through an independent channel.
- Never give remote access to an unsolicited caller. A person claiming to recover stolen crypto can be another scammer; do not hand over a recovery phrase or pay an advance “unlock” fee.
- Keep browser phishing/download protection on. Install as few extensions as possible and remove unfamiliar ones. A private/incognito window does not isolate you from malware on the computer.
- On your phone, keep the OS and apps updated, use a strong screen lock, and protect the email and authenticator accounts used to recover your other accounts.

[FBI guidance on spoofing and phishing](https://www.fbi.gov/how-we-can-help-you/common-frauds-and-scams/spoofing-and-phishing).

### 4. Keep these habits

- Keep Windows’ permission prompts enabled. Approve changes only when you intentionally started a trusted task.
- Set the screen to lock promptly and require sign-in when waking. Press **Windows + L** whenever you step away.
- Leave **Settings → System → Remote Desktop** off unless you deliberately need it. Do not install remote-support software because an unsolicited caller asks you to.
- Keep Windows, browsers, applications, and wallet software updated. Avoid cracked software, unknown browser extensions, and commands copied from pop-ups.
- Scan the backup drive before restoring selected personal files. Afterwards, keep a regular backup routine and disconnect the backup drive when finished. Periodically check that you can restore a file.

### 5. A routine you can keep

- **When stepping away:** save work, lock sensitive vaults, then press Windows + L.
- **When installing:** use the official publisher or a verified WinGet package; pause at unexpected requests to weaken protection.
- **When notified of an update:** install security updates and restart when required.
- **Each week:** make and check the disconnected backup.
- **After an exposure alert:** visit the affected account directly, change its password, and review sessions and recovery methods.
- **After suspected malware:** disconnect the computer and use another trusted device for account recovery.

Use a supported Windows version and supported applications. The earlier outdated Windows 10 installation was a risk worth fixing, even though that fact alone cannot tell us how the Trojan arrived.

---

## Chapter 7: DNS filtering: Control D, NextDNS, or AdGuard Home

**Optional after Windows is installed and updated.** For a non-technical user, I would start with one hosted service: **Control D or NextDNS**. AdGuard Home is an alternative if someone will maintain it. Choose one main DNS filtering arrangement before adding overlapping tools.

### 1. What this adds

DNS is the lookup service that turns a website name into a network address. A filtering service can refuse lookups for domains associated with malware, phishing, advertising, or tracking. This can protect applications as well as your browser. [AdGuard's explanation of DNS filtering](https://adguard-dns.io/kb/general/dns-filtering/).

This also addresses the Trojan's low VirusTotal detection count: **a file might escape an antivirus scan while a domain it contacts is already blocked**. That gives another chance to interrupt a download or contact with an attacker's server. Blocking a connection does not undo any theft that has already happened.

DNS filtering works on domain names. It cannot inspect every downloaded file or decide whether every page on an otherwise legitimate website is safe. Programs using direct network addresses or a different DNS service may avoid that filter. Keep the antivirus and browser protections already configured.

### 2. Pick one route

| Option | Who it suits | What to arrange |
| --- | --- | --- |
| [Control D](https://controld.com/) | Someone who wants a hosted service with configurable filters and device profiles | Choose a plan that includes the custom controls you want; follow its Windows setup wizard. |
| [NextDNS](https://nextdns.io/) | Someone who wants a hosted service with security settings and selectable blocklists | Save your configuration to an account; check the current plan's usage allowance and what happens when it is reached. |
| [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) | Someone with help maintaining a home DNS server | An appropriate device must stay running, receive updates, and be configured as the network's DNS server. |

Hosted services move server maintenance to the provider. AdGuard Home gives you local control but adds a device to maintain. Router-only filtering covers devices using that router; a laptop away from home needs a separate arrangement.

#### Route A: Control D on this Windows PC

1. Open [Control D](https://controld.com/) yourself, create an account, and choose a suitable plan.
2. In the dashboard, create a **Profile** for your personal computer. A profile is the collection of filters you want applied.
3. Open its **Filters** and enable **Malware**, **Phishing**, and a moderate **Ads & Trackers** setting. Leave unrelated categories at their defaults initially. Read the information beside any filter before choosing a stricter mode. [Filter settings](https://docs.controld.com/docs/filters).
4. Open **Endpoints**, add a Windows endpoint, and make sure it uses that profile. A profile has no effect until assigned to an endpoint. [Profiles and endpoints](https://docs.controld.com/docs/profiles).
5. Select **Help Me Configure → Automatic Setup**. Download the Windows utility through that official setup flow.
6. Launch the utility and paste the endpoint's **Resolver ID** when requested. Keep the recommended **Managed** mode unless your helper has a reason to change it.
7. Wait for **Configured**, then open the linked **Configuration Status Page**. Confirm that it shows your intended configuration. [Control D's illustrated Windows utility guide](https://docs.controld.com/docs/gui-setup-utility).

Keep the utility available so you can change or undo its setup later. Its **Disable Control D** control removes the device's Control D configuration; use that documented route if needed rather than guessing at network changes.

#### Route B: NextDNS on this Windows PC

1. Visit [NextDNS](https://nextdns.io/), create an account, and open its configuration dashboard. Save the configuration to your account.
2. Open **Setup** and follow the current **Windows** instructions shown for your configuration. Use the configuration ID or encrypted DNS address supplied there; a generic public DNS address does not identify your personal settings.
3. Open **Security**. Keep the recommended defaults and review the available threat-intelligence, phishing, and lookalike-domain protections.
4. Open **Privacy**. Start with the supplied/default blocklist rather than enabling every list.
5. Open **Settings** and choose whether to keep query logs and for how long. Short retention can help troubleshoot blocked sites; disable logging if you prefer and do not need that troubleshooting history.
6. Return to **Setup** and confirm that the device is using your configuration. Review the account's usage periodically if your plan has a query limit.

NextDNS documents its security protections, logging choices, and encrypted DNS support on its [official feature page](https://nextdns.io/). Dashboard labels and setup methods can change; use the instructions shown in your own account.

#### Route C: AdGuard Home, with help

Ask your helper to install and update [AdGuard Home from the official project](https://github.com/AdguardTeam/AdGuardHome), secure its administration screen, and configure your router to give devices the intended DNS settings. Keep its DNS and administration interfaces private; do not expose them to the internet.

Have the helper explain what to do if that device stops working. Keep a copy of the configuration and the router's previous DNS settings. For a laptop or phone used away from home, arrange filtering on that device too. Do not open your home DNS server to the internet to solve this.

### 3. Start with a manageable set of filters

My suggested starting point is **malware and phishing protection, plus one maintained ads/tracking list or the provider's equivalent categories**. Let that run before adding stricter options.

- **Newly registered domains:** an optional stricter layer. A legitimate new business or service can be caught too, so expect occasional checking and exceptions.
- **Large collections of overlapping lists:** add them only for a specific reason. More enabled lists do not give you an understandable measure of extra safety.
- **Broad categories such as file hosting, VPNs, or entire country domains:** leave them alone unless you deliberately want those services blocked.

If a legitimate application breaks, note the time, check the service's recent blocked queries if logging is enabled, and verify which domain it needs. Ask for help before adding an exception you do not understand. Allow the smallest verified exception; avoid turning all protection off to make one site work.

### 4. Check browsers, the VPN, and devices away from home

A browser's **Secure DNS/DNS over HTTPS** setting can use a different provider from Windows. Configure it to use your chosen filtering service, or follow that service's instructions for using the system configuration. In Firefox, the setting is under **Settings → Privacy & Security → DNS over HTTPS**. Do not switch encrypted DNS off everywhere just to simplify the setup. [Control D's browser guidance](https://docs.controld.com/docs/browsers-platform), [Mozilla's DNS protection settings](https://support.mozilla.org/en-US/kb/configure-dns-over-https-protection-levels-firefox).

After configuration:

- [ ] Restart Windows and check the provider's setup/status page again.
- [ ] Repeat the check in every browser you actually use.
- [ ] Repeat with **NordVPN connected**, then disconnected. A VPN can supply different DNS settings; ask your helper to resolve conflicts using the providers' supported settings.
- [ ] If using router filtering, test the laptop on another network to check its separate device protection.
- [ ] Test a harmless domain you temporarily added to your own denylist, then remove that test rule. Do not visit real malware sites to test protection.
- [ ] Confirm normal updates, email, password-manager sign-in, and financial services still work.

Do not enter an unrelated unfiltered resolver as a “secondary DNS” and assume Windows will use it only during an outage. Follow the chosen service's instructions for all configured addresses. Keep a short note of your provider, configuration name, and how to undo the change if necessary; keep account credentials in your password manager.

---

## Chapter 8: Outbound firewall controls

**Optional advanced chapter.** Leave the ordinary firewall enabled even if you skip everything here. Restricting outgoing connections needs more decisions and maintenance; arrange help before using it on your everyday computer.

### 1. What outgoing connection controls add

An outgoing connection is a program on your PC contacting another computer. Restricting that traffic can give you another opportunity to stop an unexpected program contacting an attacker or sending information out.

Normal Windows Firewall operation allows outgoing traffic unless a rule blocks it. Keeping the firewall on therefore does not mean every unfamiliar program will ask permission before accessing the internet. [Microsoft's firewall rules and default behaviour](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules).

An allowed browser or other trusted application can still be misused. Treat the rules as control over network access, alongside the protections that govern what runs on the PC.

### 2. Choose a level you can maintain

| Choice | Day-to-day experience | My suggestion |
| --- | --- | --- |
| Ordinary Windows Firewall or ESET's automatic firewall mode | Few interruptions; maintain normal protection and specific rules when needed | A reasonable starting point. |
| Connection prompts for traffic without a matching rule | You decide whether unfamiliar communication should proceed | Arrange an initial setup session with someone who can explain the prompts. |
| A maintained list of permitted traffic, blocking the rest | Unapproved communication stops; new software may need new rules | An advanced choice with a helper and a recovery plan. |

Use one deliberate firewall arrangement. If your ESET edition includes its firewall, start there instead of installing another competing firewall product. If it does not, keep Windows Firewall on and discuss its advanced options with your helper.

### 3. ESET's optional connection prompts

For an ESET Windows product that includes a firewall:

1. Open ESET and press **F5** for Advanced setup.
2. Open **Protections → Network access protection → Firewall**.
3. Find **Filtering mode**. Note the current setting before changing it.
4. With your helper present, select **Interactive mode** and save.

Interactive mode asks when no existing rule covers a connection; a decision can be saved as a rule. **Automatic mode** generally permits outgoing connections. **Policy-based mode** blocks traffic without an applicable allow rule. ESET advises using Interactive mode temporarily to establish rules, and reserves Policy-based mode for knowledgeable administrators. [ESET's filtering modes and current screen instructions](https://support.eset.com/en/kb3190-firewall-filtering-modes-in-eset-windows-home-products).

Practise with ordinary programs on the freshly rebuilt, updated PC. Open your browser, email, password manager, backup software, and VPN deliberately. Do not assume that every request during setup is safe merely because it appeared during that session.

Before allowing an unfamiliar request:

- Check which program made it and whether you deliberately launched that program.
- Ask your helper to inspect its location, publisher information, and destination where available. A familiar name alone is insufficient.
- Avoid permanent rules for something you cannot identify. If temporarily denying it breaks a legitimate task, investigate that task with help.
- Never allow a program solely because it claims a payment, wallet, or security update needs the connection.

After the initial session, choose the continuing mode deliberately. Returning to Automatic mode does not preserve a general requirement that all unlisted outgoing traffic be approved. A helper can maintain Policy-based mode if that stricter approach is practical for you. Expect software changes to require rule reviews.

Do not leave automatic **Learning mode** running indefinitely: building rules automatically can also teach the firewall to permit unwanted activity.

### 4. Windows Firewall as an alternative

Windows has an advanced firewall console, accessible by searching Start for **Windows Defender Firewall with Advanced Security**. It supports program-specific outgoing rules and changing a network profile's default outgoing action. Its ordinary interface does not supply an ESET-style approval prompt for each unlisted outgoing connection.

For this guide, ask a helper to prepare the rules and a way back **before** changing the default outgoing action to Block. Windows networking services, name lookups, updates, activation, time synchronisation, and security software need appropriate access too. A blanket “block everything” rule is unsuitable: explicit block rules can override the exceptions you intended to allow. [Microsoft's firewall rule precedence](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules).

A maintained notification tool that works with Windows Firewall is another possible route. Have your helper choose and support one; avoid collecting firewall utilities from download sites or enabling two tools to manage the same rules independently.

### 5. Test, and keep the way back

Before relying on the stricter setup:

- [ ] Record the previous mode/settings and save a configuration backup if supported.
- [ ] Confirm your helper can restore those settings locally, without an internet connection.
- [ ] Check Windows Update, antivirus updates, browser access, email, LastPass, backups, and activation.
- [ ] Test NordVPN connection, disconnection, and reconnection if you use it.
- [ ] Restart and repeat the important checks.
- [ ] Test blocking a harmless application your helper chooses.

If something essential fails, restore the previous working configuration and investigate. Keep the firewall enabled. Restricting connections should result in decisions you understand, rather than a daily stream of prompts you routinely approve.

---

## Chapter 9: Browser, router, and financial-device safety

**Optional after installation.** Start with the browser steps. Router changes and a dedicated financial device can be arranged later with help. These additions work alongside the Windows, account, wallet, and backup chapters.

### 1. Add a reputable browser content blocker

A browser content blocker can stop advertising and other unwanted content within pages. This complements DNS filtering, which operates on whole domain names.

One practical option is **Firefox with uBlock Origin by Raymond Hill**:

1. If you choose Firefox, install it from [Mozilla](https://www.mozilla.org/firefox/new/) or a verified WinGet package.
2. Open the [official Firefox listing for uBlock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/).
3. Check the name **uBlock Origin** and author **Raymond Hill**, then click **Add to Firefox** and confirm the permission prompt.
4. Start with its default settings. They include maintained advertising, tracking, and malicious-URL filters. Avoid changing advanced scripting controls until you understand their effect.
5. Keep Firefox and the extension updated. If a site breaks, investigate the specific site before disabling protection broadly.

The extension needs access to website content to perform its filtering. Get it from the linked official listing; similarly named extensions may be different products. If staying with another browser, ask your helper to choose a currently supported blocker from its official extension store. You do not need several blockers performing the same job.

Review existing extensions through the browser's **Extensions** menu. Remove ones you do not recognise or need, particularly unnecessary shopping helpers, download assistants, and wallet extensions. Keep the browser's own phishing and dangerous-download warnings enabled.

For banking and wallet websites, use bookmarks created after verifying the genuine address. A separate browser profile with only essential extensions can keep financial activity organised, but it shares the same Windows installation and is not a boundary against malware already running on that PC.

### 2. Preserve document and application protections

Office documents can contain executable macros. Keep internet-sourced macro blocking enabled. If an invoice, job offer, or other downloaded document says you must enable macros or weaken security to read it, stop and verify the request through a separately obtained contact method. [Microsoft's explanation of internet macro blocking](https://learn.microsoft.com/en-us/microsoft-365-apps/security/internet-macros-blocked).

If you use desktop Microsoft Office, ask your helper to confirm its macro settings and updates. Do not follow a sender's instructions to remove a file's security marking, place it in a trusted folder, or bypass a protection warning merely to make it open.

Also revisit **Windows Security → App & browser control**, covered in the [Windows security chapter](#2-review-windows-security). Where available and compatible, **Smart App Control** provides an additional decision about whether an application may run. This is relevant when an antivirus has not recognised a new Trojan. Preserve the settings it needs and use the earlier chapter's explanation of availability and privacy choices. [Microsoft's Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview/).

If a legitimate application is blocked, obtain a current copy from the genuine developer and investigate with help. Avoid permanently weakening the whole PC to accommodate one unexplained download.

### 3. Secure the home router

Arrange a short setup session with someone who understands your particular router. Before changes, have its instructions, current settings, and internet-provider support details available. Do this locally; do not depend on a remote connection that your changes could interrupt.

Ask the helper to:

1. Install current official firmware and enable automatic security updates if available. Replace a router that no longer receives necessary security support.
2. Set a unique **router administrator password**, separate from the Wi-Fi password, and keep it in your password manager.
3. Use **WPA3-Personal**, or WPA2 with AES when older devices require it. Avoid WEP and obsolete WPA modes.
4. Disable unnecessary internet-facing router administration and **WPS**.
5. Review **UPnP**, which can let applications arrange incoming port mappings. Disable it if unneeded; check gaming, calling, or other applications afterward rather than opening broad ports to fix a problem.
6. Keep the router's firewall enabled and review unfamiliar port-forwarding rules.
7. Put visitors and smart-home devices on a guest/IoT network where practical. Confirm that this network actually prevents access to your main devices; a second Wi-Fi name alone does not establish isolation.

The [FTC's home-network guide](https://consumer.ftc.gov/articles/how-secure-your-home-wi-fi-network) covers the core router precautions. Save a configuration backup if the router supports it and confirm that your normal devices, DNS filtering, and internet connection still work.

If a printer or casting device stops working across the separated networks, ask for a narrow solution. Do not undo all isolation or expose its management interface to the internet.

### 4. Consider a dedicated device for important financial activity

Given the earlier theft, this is an option I would seriously consider before buying more overlapping security subscriptions. A separate, maintained device gives stronger separation than a different browser profile on your everyday PC.

Keep that device simple:

- Install only necessary financial applications, an updated browser, and essential security software.
- Avoid casual downloads, experimental software, ordinary email attachments, and remote-support sessions on it.
- Keep it updated, encrypted, and physically secured. Turn it off when finished.
- Use strong sign-in protection and hardware security keys where supported.
- Use a hardware wallet for appropriate assets, following the [wallet security chapter](#4-protect-the-replacement-wallet). Verify transaction details on its own screen; keep recovery words offline.

If a dedicated device is impractical, reduce unrelated software and activity on the computer used for valuable accounts. Keep only the funds needed for routine activity in a day-to-day wallet, with the remainder managed according to a recovery plan you understand. Never move funds to a “safe wallet” supplied by an unsolicited helper.

### 5. Keep the routine manageable

You do not need to finish every optional chapter this weekend. A reasonable next session is: install one browser blocker, configure one DNS service, check both still work with the VPN, then test your disconnected backup.

Arrange router changes as another session. Treat strict outgoing firewall rules and Linux with a Windows VM as later projects requiring support. Keep a short list of the protections you chose and how to recognise their alerts. When something changes, troubleshoot that layer deliberately rather than turning everything off.

---

## Chapter 10: Linux with Windows in a virtual machine

**My recommendation for another layer of separation is to use Linux as the main operating system and run Windows in a virtual machine only for software that needs it.** A virtual machine is a separate Windows environment running inside an application on Linux. Shut it down when finished. This can reduce the exposure of your main environment to Windows software, but it is not bulletproof, and it is a separate setup project rather than a requirement for completing this guide.

Have a knowledgeable helper check application compatibility, hardware resources, and the VM configuration. Use a supported Linux release, enable its security updates and disk encryption, and keep Windows and the virtualization software updated too. [Ubuntu's security-update information](https://documentation.ubuntu.com/security/security-updates/).

For useful separation:

- Keep your main password database, wallet secrets, and sensitive Linux folders out of the Windows VM.
- Leave shared clipboard, drag-and-drop, broad shared folders, and unnecessary USB passthrough disabled. Share only the individual files you deliberately need; make shares read-only where practical. Use the VM's default NAT networking instead of exposing it directly through bridged networking unless there is a reason.
- **Shutting down a VM does not erase it.** An infection saved on its virtual disk may return at its next start. If you want a disposable Windows session, have your helper set up a clean baseline and explain how to discard session changes or restore a known-clean snapshot.
- Save legitimate work deliberately before discarding changes. A rollback can erase work inside the VM, cannot undo stolen credentials, and does not undo changes to shared files outside it. Keep the clean baseline updated rather than repeatedly returning to an old unpatched copy.
- Check that any Windows-only application actually works in a VM; some games, hardware tools, and specialized applications may not.

[VirtualBox's documentation on sharing, snapshots, and security](https://download.oracle.com/virtualbox/UserManual.pdf). Linux also needs careful downloads and account protection; phishing and a compromised wallet phrase can affect you on either operating system.

### A manageable way to try it

1. Make and verify a full backup before changing operating systems again.
2. List the applications and hardware you need, then ask a helper to test Linux compatibility and Windows-VM compatibility.
3. Try the proposed Linux desktop before committing to it. Use a supported release and make updates straightforward.
4. Have the helper configure disk encryption, the Windows VM, minimal sharing, and a clear way to save legitimate work.
5. Create a known-clean, updated Windows baseline. Practise restoring it with harmless test files before depending on disposable sessions.
6. Keep backups of real work outside disposable VM changes, while avoiding broad access from the VM to all your files.

**Shut down the Windows VM when done.** If you want it wiped back to a clean state each time, use the prepared discard/rollback workflow as well; simply closing its window may suspend it instead of shutting it down, and shutting down preserves its disk.

This can add useful separation for Windows-only software. It also adds maintenance and new habits, so treat it as a later project with help rather than another requirement for finishing the Windows installation today.

---

## Chapter 11: Final step: install software with WinGet

**Optional convenience after the installation and any security setup you chose.** The installation guide already shows the early Rufus shortcut; the same method works for many other applications.

WinGet can find and install many applications without visiting a download page for each one. Right-click **Start → Terminal** and search for the application you want, for example:

```powershell
winget search Rufus --source winget
```

Check the name and the **Id** in the results. To inspect a package before installing:

```powershell
winget show --id Rufus.Rufus --exact --source winget
```

Then install that exact package:

```powershell
winget install --id Rufus.Rufus --exact --source winget
```

For another application, search its name and replace `Rufus.Rufus` with its verified package ID. The `--exact` and `--source winget` options make your selection explicit. Read the displayed publisher and package details; some installations still show an agreement or administrator prompt. Use the separate administrator credentials when needed.

To install a different application, repeat the same search → inspect → install sequence with its exact package ID. Do not assume an application is from its developer just because its name looks familiar.

You can list available application updates with:

```powershell
winget upgrade
```

Keep applications' own automatic updates enabled too. WinGet uses downloaded installers and is a convenient installation method, not a guarantee that any application is safe. Do not bypass a hash/signature failure or disable Windows protection to force an installation. If WinGet is missing, update **App Installer** from Microsoft in the Microsoft Store, as described in [section 4 of the installation guide](https://blog.subzerodev.com/complete-guide-to-installing-windows-11/#4-download-rufus-and-make-the-usb). [Microsoft's search command](https://learn.microsoft.com/en-us/windows/package-manager/winget/search), [install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).

To update one package, use its exact ID after reviewing the available update:

```powershell
winget upgrade --id Rufus.Rufus --exact --source winget
```

Save your work first; some installers close applications or request a restart. You do not need to start Terminal as administrator for every search: approve elevation only when the particular installer requires it.

---

*Features, subscription plans, and settings checked 29 October 2026. Screen labels and availability can change.*
