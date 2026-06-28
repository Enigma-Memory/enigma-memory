> **Status:** A Microsoft account session was found in Microsoft Edge on the user's workstation. Azure Artifact Signing account creation was attempted through that session, but Azure rejected `Azure subscription 1` with: "Artifact Signing is not available for free, trial or sponsored subscriptions. Upgrade to a paid subscription to proceed." Upgrade or switch to an eligible paid subscription before continuing.
>
> **Tauri updater key status:** `TAURI_SIGNING_PRIVATE_KEY` has been generated and stored as a GitHub secret. The matching public key is committed in `apps/desktop-tauri/tauri.conf.json`.

# Code Signing Setup for Public Launch

This guide lists the two external signing paths required for a frictionless public desktop launch. Repository scaffolding is in place; subscription eligibility, account setup, and certificate setup remain.

## Windows — Azure Artifact Signing (formerly Trusted Signing)

**Why:** Public Trust certificates from Azure prevent SmartScreen warnings and do not require buying a hardware token. Certificates are short-lived (3 days) but signatures remain valid.

**Prerequisites:**
- Paid Azure subscription (free/trial/sponsored subscriptions are not supported).
- Microsoft account with Azure access.
- Individual developers: driver's license or passport + selfie verification. Organizations: business verification documents.
- Public Trust is available for individuals in the US/Canada and organizations in the US, Canada, EU, and UK.

**Steps:**

1. Register the resource provider:
   ```bash
   az provider register --namespace Microsoft.CodeSigning
   ```
2. Create an **Artifact Signing account** in the Azure portal (search "Artifact Signing").
3. Start **Identity validation** → select **Public** trust.
4. Create a **Public Trust certificate profile**.
5. Assign the **Artifact Signing Certificate Profile Signer** role to the service principal or managed identity used in CI.
6. Install the Azure Code Signing client tools on the Windows runner and add the signing step to the Tauri build.

**Repository secrets to add:**
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_CODESIGN_ACCOUNT_NAME`
- `AZURE_CODESIGN_CERT_PROFILE_NAME`
- `AZURE_CODESIGN_ENDPOINT` (e.g. `https://eus.codesigning.azure.net`)

**CI integration:** See `.github/workflows/desktop-release.yml` (conditional signing steps).

## macOS — Apple Developer Program + Notarization

**Why:** macOS Gatekeeper blocks apps that are not signed with a Developer ID and notarized by Apple. Notarization has been required for all apps distributed outside the Mac App Store since macOS 10.15 Catalina.

**Prerequisites:**
* Active Apple Developer Program membership ($99/year).
* Apple ID with two-factor authentication enabled.
* A Mac running macOS to create/export Developer ID certificates and to run `notarytool` for notarization.
* Xcode 13 or later installed on that Mac.

### Enrollment

* **URL and cost:** Enroll at https://developer.apple.com/programs/ . The Apple Developer Program costs **$99 USD per year** (or local equivalent).
* **Choose account type:**
  * **Individual / sole proprietor:** No D-U-N-S Number required. You can review the license agreement and purchase membership immediately at enrollment.
  * **Organization (company, educational institution):** A **D-U-N-S Number** registered to the legal entity is required. Government organizations may optionally provide one. Apple does **not** accept DBAs, fictitious business names, trade names, or branches.
* **Enrollment without a Mac:** The Apple Developer Program application and payment can be completed in any web browser — a Mac is **not required for enrollment**. However, Apple may require identity verification through the Apple Developer app, which needs an iPhone/iPad with Touch ID, Face ID, or passcode, or a Mac with the T2 Security Chip/Apple Silicon.

### D-U-N-S Number (organizations only)

* Request or look up your number at https://developer.apple.com/enroll/duns-lookup/ or directly from Dun & Bradstreet.
* D&B can take up to **5 business days** to issue a new D-U-N-S Number; expediting does not shorten this wait.

### Developer ID certificates

You need **two** types of Developer ID certificates to distribute outside the Mac App Store:
* **Developer ID Application** — signs the app binary.
* **Developer ID Installer** — signs the installer package (PKG/DMG).

Both are valid for **5 years** from creation and can be generated immediately after membership is active.

#### Create the certificates

1. Sign in to https://developer.apple.com/account/resources/certificates/list .
2. Click the **+** button to add a certificate.
3. Select **Developer ID Application** under the "Software" section, then click **Continue**.
4. You can generate the certificate in two ways:
   * **Option A — Xcode (recommended):** Open Xcode, go to **Settings/Preferences > Accounts**, select your Apple ID and team, then click **Manage Certificates**. Right-click and choose **Add Apple ID > Developer ID Application**.
   * **Option B — Certificates, Identifiers & Profiles:** On the web, follow the prompts. You will need to create a Certificate Signing Request (CSR) using **Keychain Access** on a Mac:
      * Open Keychain Access (`/Applications/Utilities/Keychain Access.app`).
      * Choose **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority**.
      * Enter your email and common name, leave CA Email blank, select **Saved to disk**, and click **Continue**.
      * Upload the `.certSigningRequest` file to Apple, then download the resulting `.cer` certificate.
5. Repeat the process for **Developer ID Installer**.
6. Double-click each downloaded `.cer` file to install it into Keychain Access (usually under **login**).

### Export certificates as `.p12`

The CI workflow needs the certificate **plus its private key** as a base64-encoded `.p12` file.

* On the Mac where the certificates were created/installed, open **Keychain Access**.
* Select **login** keychain and the **My Certificates** category.
* Locate the **Developer ID Application** certificate. It must show a disclosure triangle indicating a private key is attached.
* Expand the certificate entry, **select both the certificate and its private key**, then right-click and choose **Export 2 items...**.
* In the dialog:
  * **File Format:** Personal Information Exchange (.p12).
  * Choose a filename and location.
  * Set a strong export password and remember it.
* Repeat for **Developer ID Installer** if your packaging step uses a PKG installer.

> **Important:** Exporting only the certificate without its private key will fail in CI. The export must be a *digital identity* containing both the certificate and private key.

### App-specific password for notarization

Do **not** use your Apple ID account password in CI. Generate an app-specific password:

* Sign in to https://appleid.apple.com/ with the same Apple ID used for the Developer Program.
* Go to **Sign-In and Security > App-Specific Passwords**.
* Click **Generate an app-specific password**.
* Enter a label (e.g., `Enigma Desktop Notarization`) and click **Create**.
* Copy the generated 19-character password immediately; Apple shows it only once.

### Add secrets to GitHub

Go to **Settings > Secrets and variables > Actions** in the repository and add:

* `APPLE_CERTIFICATE` — base64-encoded `.p12` for the Developer ID Application certificate.
* `APPLE_CERTIFICATE_PASSWORD` — the export password you set in Keychain Access.
* `APPLE_ID` — the Apple ID email address used for the Developer Program.
* `APPLE_PASSWORD` — the app-specific password generated above.
* `APPLE_TEAM_ID` — your Apple Developer Team ID (found on https://developer.apple.com/account/ under Membership details).

To base64-encode the `.p12`:

```bash
openssl base64 -in developer-id-application.p12 -out developer-id-application.p12.b64
```

Then copy the contents of `.p12.b64` into the GitHub secret value.

### CI integration

The macOS build step is already configured in `.github/workflows/desktop-release.yml`:

```yaml
APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
APPLE_ID: ${{ secrets.APPLE_ID }}
APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Tauri reads these environment variables to sign and notarize the DMG automatically.

### Expected timeline

* Request D-U-N-S Number (organizations only): up to 5 business days.
* Apple Developer Program enrollment review: 1–5 business days for individuals; 1–4 weeks for organizations.
* Developer ID certificate creation: immediate once membership is active.
* Certificate export + secret setup: ~15–30 minutes.
* First signed/notarized build: depends on CI queue; notarization itself usually 1–5 minutes.

**Realistic fast-path total:**
* **Individual:** 1–3 business days from enrollment to first signed build.
* **Organization with existing D-U-N-S:** 3–10 business days.
* **Organization needing a new D-U-N-S:** 2–6 weeks total.

### Mac requirements summary

* **Enrollment:** No Mac required; can be done in a browser.
* **Identity verification via Apple Developer app:** Requires iPhone/iPad or a modern Mac.
* **Creating/exporting Developer ID certificates:** Requires a Mac (Keychain Access / Xcode).
* **Notarization (`notarytool`):** Requires a Mac running macOS; GitHub Actions `macos-latest` runners satisfy this.

## External blockers

* Apple Developer Program enrollment typically takes 1–5 business days for individuals and 1–4 weeks for organizations; organizations may also need up to 5 business days to obtain a D-U-N-S Number.
* Azure Artifact Signing identity verification usually takes minutes to hours but requires a mobile device for document/selfie capture.
* Both paths require payment. Azure Artifact Signing specifically requires an eligible paid Azure subscription; free, trial, and sponsored subscriptions are rejected by the portal.
