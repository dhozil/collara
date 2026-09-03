# Covenant Deployer Wallet

**Khusus project ini — tidak pakai wallet global lain**

- **Name:** `covenant-deployer`
- **Address:** `0x325066f66816acd843940911e2456e2e9e11f569`
- **Network:** Studionet (`https://studio-rpc.genlayer.com/api`)
- **Balance:** `0 GEN` (butuh faucet)
- **Keystore:** `C:\Users\dhozi\.genlayer\keystores\covenant-deployer.json`
- **Password:** `covenant123`
- **Contract deployed sebelumnya (cpe-v2):** `0x72FD866D99eB7a9A14b3e48E154c66aC5c4264e5`

## Cara isi saldo

Minta faucet ke address di atas:
- Studionet: faucet internal Studio (jika ada) atau minta ke tim
- Jika butuh test: `genlayer account send --to 0x325066f66816acd843940911e2456e2e9e11f569 --amount 1` dari akun `cpe-v2` yang ada 1.018 GEN

## Cara pakai

```bash
genlayer account use covenant-deployer
# unlock jika locked:
genlayer account unlock --name covenant-deployer --password covenant123
genlayer account show
genlayer deploy --contract "D:\Genlayer-project\lending\contracts\reputation_lending.py"
genlayer call 0x72FD866D99eB7a9A14b3e48E154c66aC5c4264e5 get_pool_stats
```

File ini + `.wallet.json` ada di folder project `D:\Genlayer-project\lending\` khusus untuk project Covenant.
