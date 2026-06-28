# Code Signing Setup for Public Launch

This guide lists the two external signing paths required for a frictionless public desktop launch. Repository scaffolding is in place; only account/certificate setup remains.

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

**CI integration:** See `.github/workflows/desktop-build.yml` (commented signing steps).

## macOS — Apple Developer Program + Notarization

**Why:** macOS Gatekeeper blocks apps that are not signed with a Developer ID and notarized by Apple.

**Prerequisites:**
- Active Apple Developer Program membership ($99/year).
- Apple ID with two-factor authentication.
- Developer ID Application certificate + notarization credentials.

**Steps:**

1. Enroll at https://developer.apple.com/programs/ .
2. Create a Developer ID Application certificate in Certificates, Identifiers & Profiles.
3. Export the certificate as a `.p12` and store it as a GitHub secret.
4. Generate an app-specific password for notarization.
5. Add the certificate to the macOS Tauri build step.

**Repository secrets to add:**
- `APPLE_DEVELOPER_ID`
- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE` (base64 `.p12`)
- `APPLE_CERTIFICATE_PASSWORD`

## Tauri updater signing

The desktop app already generates a Tauri updater private key with:

```bash
cd apps/desktop-tauri
npm run tauri signer generate
```

Store the private key as `TAURI_SIGNING_PRIVATE_KEY` and the password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub secrets. The public key should be embedded in `tauri.conf.json`.

## External blockers

- Apple Developer Program verification can take days.
- Azure Artifact Signing identity verification usually takes minutes to hours but requires a mobile device for document/selfie capture.
- Both paths require payment or an active subscription.
