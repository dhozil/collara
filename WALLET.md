# Collara Deployer Wallet

**Khusus project ini — tidak pakai wallet global lain**

- **Name:** `lending-clean` (aktif)
- **Address:** `0x3aac4333f9c2ab79ebd78e31a12b26ec10c675e8`
- **Network:** Studionet (`https://studio.genlayer.com/api`)
- **Active Contract:** `0x737F198B83b57101CF1fcDfA7cf906d69b70E581` (tx `0xca725a9bd94b615e6015872845cf40172cdc72668f99e5e0fed0e686e84a06e7` 5x AGREE)
- **Keystore:** `C:\Users\dhozi\.genlayer\keystores\lending-clean.json`
- **Password:** `clean123`
- **Previous:** `0xBa359c8a...`, `0x6e9e6b05...`, `0x4FdAd054...`

## Cara pakai

```bash
genlayer account use lending-clean
genlayer account unlock --account lending-clean --password clean123
genlayer deploy --contract "D:\Genlayer-project\lending\contracts\reputation_lending.py"
genlayer call 0x737F198B83b57101CF1fcDfA7cf906d69b70E581 get_pool_stats
```

File ini + `.wallet.json` ada di folder project `D:\Genlayer-project\lending\` khusus untuk project Collara.
