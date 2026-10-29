---
title: "Complete Guide to Installing Windows 11"
description: "Install Windows 11 from Microsoft, make a Rufus USB, optionally separate C: and D:, and upgrade to Enterprise if you have a suitable key."
slug: complete-guide-to-installing-windows-11
authors:
  - subzerodev
date: 2026-10-29T12:00:00Z
tags:
  - windows
---

Start here. This guide takes you from downloading Windows to a working, updated installation. It includes an **optional C:/D: split**, which I recommend because it makes a later Windows reinstall much easier.

**The route: download the official Microsoft ISO → make a USB with Rufus → install Windows 11 Pro → update and activate Windows.** You do not need an MSDN subscription. If you have a suitable Enterprise key, you can optionally upgrade Pro to Enterprise afterward without reinstalling.

**Follow sections 1–10 in order, then restore your selected personal files. Section 11 is an optional Enterprise upgrade.** After installation, use my separate [Extensive Guide to Online Privacy and Security](https://blog.subzerodev.com/extensive-guide-to-online-privacy-and-security/) for additional hardening and privacy. Start with its essentials; you do not need every tool or subscription.

<!-- truncate -->

## How to use this guide

I put this together for a friend who needed to rebuild Windows. The installation comes first. My security recommendations are in the companion entry so you can finish one job before taking on the next.

The initial clean installation erases the chosen disk, so the backup steps matter. The optional C:/D: layout is my practical preference for making future reinstalls easier.

Button names below are in English. You can choose **English or Spanish** Windows. For orientation: Settings = **Configuración**, Disk Management = **Administración de discos**, and Windows Security = **Seguridad de Windows**. Some screen wording changes between versions.

## 1. Before you erase anything

You need:

- A **trusted, working Windows computer** to prepare the USB. If the old PC may have malware, use another computer.
- An empty **16 GB or larger USB stick**. Rufus will erase it.
- A **separate external drive** for your backup. The installation USB is not a backup drive.
- An appropriate **Windows 11 Pro license** or an existing Pro digital license for this PC. You can skip entering a key during installation and activate afterward. An Enterprise key is optional.
- A power connection and time for installation and updates.

**Check your Windows license before wiping.** Reinstall the edition your license covers. This guide uses Pro; a Home license does not activate Pro. Choosing “I don’t have a product key” during Setup postpones key entry, and an existing matching digital license may reactivate automatically once online. If you plan to use an Enterprise key later, confirm that it supports Pro-to-Enterprise on this PC: Enterprise licensing often also requires a qualifying underlying Windows license. [Microsoft’s activation guide](https://support.microsoft.com/en-us/windows/activate-windows-c39005d4-95ee-b91e-b399-2820fda32227), [qualifying-license guidance](https://www.microsoft.com/licensing/guidance/Windows-11-Qualifying-Operating-System).

**After a suspected theft:** disconnect the suspect PC. Use a clean phone or computer to secure your email and financial accounts before signing into them again. Reinstalling Windows does not invalidate stolen passwords, login sessions, or wallet recovery words. The [malware and wallet chapter](https://blog.subzerodev.com/extensive-guide-to-online-privacy-and-security/#chapter-5-malware-recovery-virustotal-and-wallet-security) explains what to recover separately.

### Back up before deleting partitions

1. Copy your documents, photos, videos, and other irreplaceable files to the separate backup drive.
2. Check Desktop, Documents, Downloads, Pictures, and any existing D: drive.
3. Open several backed-up files to check that the copy worked.
4. If the old computer uses BitLocker, save its recovery keys before making firmware changes or wiping anything.
5. **Unplug the backup drive before installing Windows.**

After a suspected infection, reinstall applications from their official sources. Avoid carrying over old installers, scripts, browser profiles, extensions, or a complete old system image. Scan your backup before restoring files, and leave document macros disabled.

**This guide deliberately erases the selected Windows disk, including an existing D: partition on that disk.** Back it up first. Microsoft also recommends backing up personal files before a clean installation. [Microsoft’s installation guide](https://support.microsoft.com/en-us/windows/deployment/install-upgrade/reinstall-windows-with-the-installation-media).

## 2. Download the official Microsoft ISO

An **ISO** is one large file containing the Windows installation files.

1. On the trusted computer, open [Microsoft’s Windows 11 download page](https://www.microsoft.com/software-download/windows11).
2. Scroll to **Download Windows 11 Disk Image (ISO) for x64 devices**. There are other download sections above it; keep scrolling past the Installation Assistant and installation-media tool.
3. In its dropdown, select the **Windows 11 multi-edition ISO for x64**.
4. Click **Download Now**.
5. When the language selection appears, choose your preferred language:
   - **English**: choose the United States or International option you prefer.
   - **Spanish**: choose the Spain or Mexico option you prefer, if both are offered.
6. Click **Confirm**, then the **64-bit Download** button.
7. Save the file in Downloads and wait until the download finishes. The filename should end in `.iso`.

The download is several gigabytes. If its temporary download link expires, repeat the language selection to generate another one. Keyboard layout is a separate choice during installation: English Windows can use a Spanish keyboard.

**This x64 guide is for Intel and AMD PCs.** A Snapdragon/Arm PC needs Arm64 media and a different preparation path.

Use this regular Microsoft download for the Pro-to-Enterprise route. Avoid an Enterprise Evaluation ISO: that is a time-limited trial with different conversion restrictions. [Microsoft’s Enterprise evaluation page](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise).

## 3. Check TPM and Secure Boot

**TPM** is a security component that Windows can use to help protect encryption keys. Many PCs provide it through their processor or firmware rather than a separate plug-in module.

If the computer can still start Windows:

1. Press **Windows + R**.
2. Type `tpm.msc` and press Enter.
3. Look for a message that the TPM is ready, with **Specification Version 2.0**.

If it is missing or disabled, it may simply need enabling in the computer’s firmware settings. Manufacturers may call it **Intel PTT**, **AMD fTPM**, or **Security Device**. Follow your PC manufacturer’s instructions. **Do not choose “Clear TPM.”** Keep any existing BitLocker recovery keys before changing firmware settings. [Microsoft’s TPM instructions](https://support.microsoft.com/en-us/windows/security/devicesecurity/enable-tpm-2-0-on-your-pc).

Also keep **Secure Boot enabled** when the hardware supports it. This helps prevent malicious software from loading before Windows. You can check its status by pressing Windows + R, entering `msinfo32`, and looking for **Secure Boot State: On**. [Microsoft’s device security explanation](https://support.microsoft.com/en-us/windows/security/windows-security/device-security-in-the-windows-security-app).

Rufus can bypass Windows Setup’s hardware checks when needed. That **does not add a missing TPM, disable an existing TPM, or switch Secure Boot off**. Unsupported hardware may miss updates or features, and the bypass cannot overcome every hardware limitation. For a computer used with valuable accounts or wallets, supported hardware with these protections enabled is the better choice. [Microsoft’s hardware warning](https://support.microsoft.com/en-us/windows/experience/compatibility/windows-11-on-devices-that-don-t-meet-minimum-system-requirements).

## 4. Download Rufus and make the USB

### Get Rufus with WinGet — optional shortcut

On the trusted Windows computer, right-click **Start → Terminal**. Enter these commands one at a time:

```powershell
winget search Rufus --source winget
winget install --id Rufus.Rufus --exact --source winget
```

WinGet downloads Rufus for you; you do not need to find its download through a browser. Accept the source agreement if shown and approve the Windows permission prompt for this installation. Afterwards, open Rufus from Start or the shortcut WinGet provides. If it does not appear, close and reopen Terminal and try `rufus`.

If Windows says it cannot find `winget`, update **App Installer**, published by Microsoft Corporation, through the Microsoft Store. WinGet may take a little time to become available after a first Windows sign-in. The website method below is an alternative. [Microsoft's WinGet guide](https://learn.microsoft.com/en-us/windows/package-manager/winget/).

### Or download Rufus from its website

1. Visit the official [Rufus website](https://rufus.ie/).
2. Scroll to its **Download** table.
3. Choose the current **Standard** version for **Windows x64**. It is an `.exe` file; ignore advertisement download buttons elsewhere on the page.
4. Open the downloaded file. Allow it to make changes if Windows asks. Rufus runs without a separate installation.

### Select the ISO and the correct USB

1. Plug in the empty USB stick. Keep the backup drive unplugged.
2. In Rufus, check **Device** carefully. Its name and capacity must match the USB stick you intend to erase.
3. Click **SELECT** and open the Windows `.iso` you downloaded.
4. Use these settings for a normal modern PC:

   | Setting | Choose |
   | --- | --- |
   | Image option | Standard Windows installation |
   | Partition scheme | GPT |
   | Target system | UEFI, without CSM |
   | File system and allocation size | Leave Rufus’s defaults |

5. Click **START**. The extra Windows setup options appear now.

### Choose the account and hardware options

In the customization window:

- **Tick “Remove requirement for an online Microsoft account.”** This lets you create a local Windows account.
- If Rufus offers to create a local username, you can enter a simple name, such as `Alex`. You must set a strong password during setup or immediately at first sign-in; do not leave the account with a blank password.
- **Normally leave “Remove requirement for 4GB+ RAM, Secure Boot and TPM 2.0” unticked.** Tick it only if this computer genuinely needs the hardware-check bypass described above.
- Leave the option to copy the current computer’s regional settings unticked if you want to choose your own language and keyboard settings.
- **Tick “Disable BitLocker automatic device encryption,” if offered.** The optional Windows security chapter explains how to enable BitLocker manually with offline recovery keys. This Rufus option postpones encryption; it does not turn encryption on later by itself.
- If a silent/automatic disk-erasing installation option appears, **leave it unticked**. You need to choose and partition the disk yourself.

Rufus documents both the customization options and the need to disconnect the internet for the local-account setup. Exact options depend on its version. [Official Rufus FAQ](https://github.com/pbatard/rufus/wiki/FAQ), [Rufus’s current option descriptions](https://raw.githubusercontent.com/pbatard/rufus/master/res/loc/rufus.loc).

Click **OK**, confirm the warning that the selected USB will be erased, and wait for Rufus to finish. When its status returns to **READY**, close Rufus and safely eject the stick.

## 5. Start the computer from the USB

1. Shut down the computer you are reinstalling.
2. Unplug external drives, especially your backup. Note the capacity of the internal disk you intend to erase. If there are several internal drives, have a knowledgeable helper identify them and, where practical, temporarily disconnect the others.
3. Plug in the Windows installation USB.
4. **Unplug Ethernet and do not connect to Wi-Fi yet.** Stay offline through account creation.
5. Turn the computer on and repeatedly tap its boot-menu key. Common keys are **F12, F11, F9, or Esc**; check your manufacturer’s instructions if needed.
6. Select the USB entry, preferably the one beginning with **UEFI**.

Boot from the stick for this clean installation; opening the ISO inside the old Windows installation follows a different process.

## 6. Choose Windows 11 Pro

1. Choose the installation language, region, and keyboard layout.
2. Choose the Windows installation option and continue. Some versions show **Install now**; newer versions also ask you to acknowledge that the installation will erase files.
3. At the product-key question, click **“I don’t have a product key”** (**“No tengo una clave de producto”** in Spanish). Keep any key for activation after installation. If you have an Enterprise key, section 11 explains the optional upgrade.
4. If asked which edition to install, choose **Windows 11 Pro**. Avoid Home and the editions ending in **N** for this guide.
5. Accept the license terms.
6. If offered an installation type, choose the **Custom** installation rather than an upgrade.

**If Setup automatically selects Home without offering Pro, pause before erasing the disk.** Some PCs have a built-in Home key. Ask a knowledgeable helper to prepare media that selects Pro, and confirm you have the appropriate license. Home cannot use the direct Pro-to-Enterprise upgrade in the optional section.

## 7. Erase the old installation and optionally split C: and D:

**The C:/D: split is optional. I recommend it, and have used this approach for about 20 years: keeping personal files separately makes it much easier to reinstall Windows later without erasing those files.** The recommendation here is **at least 300 GB for Windows and applications**, with the remaining space for data. That is a practical preference, not Windows' minimum requirement. It suits a 512 GB or larger drive; allow more for large applications and games. A 256 GB drive cannot accommodate this layout.

The plan is:

| Drive | Purpose |
| --- | --- |
| C: | Windows and installed applications |
| D: | Personal documents, photos, and other files |
| Separate backup drive | A recoverable copy if the PC is infected, damaged, or lost |

With your personal folders actually stored on D:, a later routine reinstall can format **only the Windows partition** and keep D:. Keep a separate backup too: malware can reach both accessible volumes, and a failed physical disk can lose both.

For this initial rebuild after a suspected infection, the instructions below delete **every partition on the selected internal disk**, including any old D:. Your checked backup must already be on a separate, unplugged drive. This removes the old installed system; it is not a secure-erasure procedure or a guarantee that restored files are harmless.

### Erase only the intended Windows disk

At the screen showing disks and partitions:

1. Identify the intended internal disk by its **capacity** and model if shown. Windows may show a marketed 512 GB disk as approximately 476 GB; this is normal.
2. Do not assume the correct disk is always Disk 0. If several disks look similar, stop and get help identifying them.
3. On **that disk only**, delete its old partitions one at a time until its space is shown as **unallocated**. This deletes the old Windows installation, its recovery partitions, and any existing data partition on that disk.
4. Leave other disks alone. Your verified, unplugged backup is what preserves your files during this operation.

**If the internal disk is missing:** stop and get help obtaining the PC manufacturer's storage driver. Do not guess at firmware storage settings or erase another listed device.

### Create the Windows partition

**If you prefer one large C: drive:** select all the unallocated space and click **Next**. Let Windows create its partitions automatically, and skip section 9 about D:.

**If you choose the recommended C:/D: split:**

1. Select the unallocated space on the intended disk.
2. Click **New** or **Create partition**, depending on Setup's wording.
3. If the size field is labelled **MB**, enter **320000**. This is a little over 300 GB as Windows measures it, with room for the small system partitions. If it uses **GB**, choose **320 GB**. You can choose a larger size for large applications or games; leave some space for D:.
4. Click **Apply** and accept the message that Windows may create additional partitions.
5. **Do not be alarmed when extra small partitions appear.** A typical modern Windows installation uses four partitions: a small **EFI System** partition for boot files, a **16 MB Microsoft Reserved (MSR)** partition, the large **Windows** partition, and a **Recovery** partition. Recovery may be created or adjusted later in Setup, and sizes/order can vary. These are normal; leave them alone.
6. Select the **large Primary partition** you just created. Check its size is **at least 300 GB**. It may not yet be called C: or Windows. Select this partition, not an EFI, MSR, Recovery, or unallocated entry.
7. Leave the remaining space **unallocated** for now. Section 9 will turn that unused space into D:. Click **Next**, then **Install** if a final confirmation screen appears.
8. Continue with installation. The computer will restart several times.

For orientation, the completed split normally looks like this; Setup may create Recovery later:

| Entry | What to do |
| --- | --- |
| Small EFI/System partition | Leave it alone; Windows uses it to start. |
| 16 MB MSR/Reserved partition | Leave it alone; this is reserved space, not the boot partition. |
| Large Primary partition, at least 300 GB | **Install Windows here.** It becomes C:. |
| Small Recovery partition | Leave it alone; Windows uses it for recovery tools. |
| Remaining unallocated space | Leave it for section 9, where you create D:. |

You will normally end up with **two visible drives, C: and D:, plus three small system partitions**—five partitions in total. You only use C: and D: in everyday File Explorer. [Microsoft's Windows partition layout](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/configure-uefigpt-based-hard-drive-partitions?view=windows-11).

If it restarts into the beginning of Setup again, boot from **Windows Boot Manager/the internal drive**, or remove the USB at that restart. Do not repeat the disk-erasing steps.

## 8. Finish setup with a local account

1. Choose your region and keyboard. Skip a second keyboard layout unless you need one.
2. Remain disconnected from Ethernet and Wi-Fi.
3. If asked about networking, choose the offline/limited-setup option Rufus has made available. The wording varies by Windows version.
4. Create your local username if Rufus has not already done so.
5. Set a **long, unique password or passphrase**. If Rufus created the account and Windows did not ask for a password, set one at the desktop: **Settings → Accounts → Sign-in options → Password → Add**. Use **Change** if it already has a password you need to replace. Keep it safely; treat security-question answers as secrets too. A Windows Hello PIN, if offered, is an additional device sign-in method.
6. Decline optional advertising and personalized offers you do not want. For a security-first setup using **Smart App Control**, allow optional diagnostic data if Windows requires it for that protection; the [Windows security chapter](https://blog.subzerodev.com/extensive-guide-to-online-privacy-and-security/#chapter-1-windows-security-eset-or-defender-and-bitlocker) explains the tradeoff. Advertising personalization is a separate choice.
7. Once you reach the desktop and the account has a password, remove the installation USB and reconnect to the internet.

If Windows still insists on a Microsoft account, check that Ethernet is unplugged and Wi-Fi is disconnected. If needed, remake the USB using current Rufus and the account-removal option. Do not enter an invented email address or follow random commands from an advertisement.

## 9. Create D: in Windows

Skip this section if you chose one large C: drive.

1. Right-click **Start** and open **Disk Management**.
2. Find the **unallocated space on the same internal disk** you installed Windows onto.
3. Right-click that unallocated area and choose **New Simple Volume**.
4. Use the remaining space and assign the letter **D**.
5. Choose **NTFS**, leave the allocation size at its default, select quick format, and label the volume **Data**.
6. Finish the wizard. D: should appear in File Explorer.

If D is occupied by another drive, remove the installation USB or have a helper identify the existing drive before assigning letters. **Do not format an existing partition just because it is not called D.** [Microsoft’s Disk Management guide](https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/disk-management-in-windows).

### Make Documents and other personal folders live on D:

Creating D: does not move your files automatically. Move Windows' personal folders using their **Location** setting so applications can find them:

1. In File Explorer, create a folder such as `D:\Alex`, using your own name instead of Alex.
2. Inside it, create separate folders named **Documents**, **Downloads**, **Desktop**, **Pictures**, **Music**, and **Videos**.
3. Press **Windows + R**, enter `%USERPROFILE%`, and press Enter. This opens your user folder.
4. Right-click **Documents → Properties → Location → Move**. If necessary, choose **Show more options** to find Properties.
5. Select `D:\Alex\Documents`, click **Select Folder**, then **Apply**. When asked to move existing files, choose **Yes**.
6. Repeat for Downloads, Desktop, Pictures, Music, and Videos, choosing each folder's matching destination on D:.
7. Save a test document, then check that it is actually inside `D:\Alex\Documents`.

**Use a separate destination for each folder.** Do not point every personal folder at the root of D:. If a folder is already managed by OneDrive, review its backup settings first; do not blindly relocate a OneDrive-managed folder. If the Location tab is missing, get help rather than dragging the whole user profile. [Microsoft's folder-location instructions](https://support.microsoft.com/en-us/onedrive/where-have-my-desktop-icons-gone).

In applications that choose their own storage locations, select a suitable folder on D: for personal projects and files. Windows, installed applications, browser profiles, and **AppData** may still use C:. Do not attempt to move the entire Windows, Program Files, or AppData folders. Back up any important application data still on C: separately.

### For a future reinstall — do not do this now

For a routine reinstall, back up first, identify the large Windows partition by disk and size, and format **only that partition**. **Do not repeat this guide's initial “delete every partition” procedure if you intend to retain D:.** Setup may show different drive letters. If the partition identity is uncertain, stop before deleting or formatting anything.

After reinstalling, repeat the Location steps to reconnect Documents and the other folders to their existing locations on D:. If D: is encrypted, you will also need its own password or recovery key. Applications need reinstalling even when their personal files survived. After another suspected compromise, assess retained files before trusting them.

## 10. Update Windows before restoring your files

1. Open **Settings → Windows Update**.
2. Check for updates, install them, and restart when asked.
3. Check again after restarting until there are no outstanding security updates.
4. Obtain any missing drivers from Windows Update or the PC/component manufacturer. Avoid third-party “driver updater” tools.
5. Update your browser and install applications only from their official sources or the Microsoft Store.

If internet access is missing, use the trusted preparation computer to obtain the network driver from your PC manufacturer's official support page. Transfer that driver on a clean USB; avoid third-party driver sites.

Avoid restoring all old browser extensions through automatic sync. Add back only the ones you recognize and still need.

### Activate Windows

Open **Settings → System → Activation**. If your existing Pro digital license has reactivated Windows, check that it says **active**. Otherwise, beside the product-key setting, click **Change**, enter your Pro key, and follow the prompts. If you have a suitable Enterprise key instead, follow the optional section below. Skipping the product key during Setup does not provide a Windows license.

Keep automatic security updates enabled and restart when requested. Moving away from an outdated Windows 10 installation matters: standard Windows 10 support ended on **14 October 2025**, although extended-update arrangements and some LTSC editions have different dates. This does not tell us how the earlier theft happened. [Microsoft's support information](https://learn.microsoft.com/en-us/windows/release-health/release-information).

## 11. Optional: turn Windows 11 Pro into Enterprise

**Skip this section if you do not have an appropriate Enterprise key.** Windows 11 Pro is enough for the BitLocker and everyday security recommendations in the companion guide. Activate Pro under **Settings → System → Activation** using your Pro key or existing matching digital license.

**If you have a suitable Windows Enterprise key, you can upgrade Windows 11 Pro to regular Enterprise without another clean install.** An Enterprise **LTSC** key needs matching LTSC media and is not interchangeable with regular Enterprise. Some subscriptions or organizational licenses use a different activation method; check with whoever supplies the license.

After Windows is installed and updated:

1. Connect to the internet.
2. Open **Settings → System → Activation**.
3. Check that the installed edition is **Windows 11 Pro**.
4. Beside the product-key setting, click **Change**.
5. Enter your appropriate Enterprise key. Supply the separate administrator credentials if Windows asks. Do not post the key in screenshots, messages, or this guide.
6. Continue through the upgrade prompts and restart if requested.
7. Return to Activation and confirm both **Windows 11 Enterprise** and an **active** activation status.

An appropriate key changes the edition without another clean installation. If activation fails, record the error code and contact the person who supplied the key. Some organizational keys need their organization’s activation service; regular Enterprise and LTSC keys are not interchangeable. Avoid third-party activators. [Microsoft’s edition upgrade instructions](https://learn.microsoft.com/en-us/windows/deployment/upgrade/windows-edition-upgrades).

## Restore selected personal files

Before reconnecting the backup, open Windows Security and confirm your chosen antivirus is active and updated. Then connect the backup and scan it before copying files. With Defender active, use **Virus & threat protection → Scan options → Custom scan → Scan now** and select the backup drive. With ESET, use its custom/computer-scan option and select that drive. Then copy selected documents and photos into their matching folders on D: or C:. Check a few files and safely disconnect the backup again.

Download fresh applications from their official sources or use the final WinGet chapter. Leave old installers, scripts, browser profiles, and unfamiliar extensions behind. If a file triggers a warning, leave it quarantined and get help instead of switching protection off to open it.


## Installation checklist

- [ ] Windows came from Microsoft, and the installation USB came from Rufus's official site or its identified WinGet package.
- [ ] The local account has a strong password.
- [ ] Windows Update has installed the available security updates.
- [ ] Activation shows my intended edition—**Windows 11 Pro**, or **Enterprise** if I chose the optional upgrade—and an active status.
- [ ] If I chose D:, it exists and my personal folders actually point to their matching folders there.
- [ ] My backup is safe and disconnected. I will restore selected personal files after checking protection, rather than restoring the old Windows system or all its applications.

**The Windows installation is complete.** You can take a break here. Before returning to everyday use, follow the basic security and backup recommendations in the companion guide; additional products can wait.

## After installation

Continue with [Extensive Guide to Online Privacy and Security](https://blog.subzerodev.com/extensive-guide-to-online-privacy-and-security/). Start with Windows security and BitLocker, one password manager, and verified backups. Before using a replacement wallet, complete the account and wallet recovery steps. DNS filtering, encrypted vaults, VPNs, strict firewall rules, and Linux/VM experiments can be considered later.

*Download pages and settings checked 29 October 2026. Screen labels can change.*
