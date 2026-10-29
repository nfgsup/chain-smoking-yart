# Chain Smoking Yart — Canapuff Edition

Mini gioco browser **one-button**: tieni premuto, inala, rilascia nel punto giusto e fuma senza fermarti. 5 device, risorse che si consumano, accensione con accendino e upgrade tra un round e l'altro.

Mobile-first, nessun build step, ~1,1 MB totali (three.js vendorizzato + 7 modelli GLB da Poly.Pizza).

![anteprima](assets/preview.webp)

## Come si gioca

- **Tieni premuto** in qualsiasi punto dello schermo: la barra dei polmoni si riempie e i punti salgono.
- **Rilascia quando la barra è nella zona verde**: fai un *PERFETTO*, la catena sale di 1 e prendi il bonus.
- La zona verde si sposta e si restringe con la catena; la difficoltà cresce ogni round.
- Se arrivi a **100%** tossisci: perdi la catena e un polmone. **3 colpi di tosse = run finita**.
- Rilasciare sotto il 30% abbassa la catena. Se stai fermo la catena scende da sola.
- **La catena non si resetta tra un device e l'altro**: è un'unica sessione.

### I device

| Device | Tipo | Risorse | Note |
|---|---|---|---|
| **YART** | box mod | liquido + batteria | il classico, bilanciato |
| **ERBA NATURALE** | blunt | erba | si accende con l'accendino, **brucia anche se non tiri** |
| **KIWI SPARK** | pod ricaricabile | liquido + batteria + **2 refill** | quando è vuoto si ricarica da solo, non è usa-e-getta |
| **NINOPUFF** | pod premium | liquido + batteria | zona più stretta, punti ×1.45 |
| **SIGARETTA** | tabacco | tabacco | brucia velocissima, zona strettissima, punti ×1.8 |

Le percentuali di liquido/batteria/erba sono reali: finita la risorsa il device si spegne e si passa allo shop.
Il joint e la sigaretta si **accendono con l'accendino** (animazione + fiamma) e si **accorciano mentre bruciano** (clipping del modello + braci ardenti).

### Upgrade

Tra un device e l'altro compare lo **shop**: con i soldi guadagnati (15% dei punti) compri 1 di 3 potenziamenti casuali, oppure salti.

- Polmoni d'acciaio (+1 polmone)
- Bocca larga (+14% zona perfetta)
- Calma (-9% velocità di inalata)
- Fumo denso (+15% punti)
- Catena lunga (la catena dura 4s in più)
- Mano fredda (+30% bonus perfetto)
- Ricambio (+1 refill, -8% consumo)
- Accendino turbo (accensione rapida, -8% bruciatura)

**Desktop:** barra spaziatrice. **Audio:** pulsante ♪ in basso (tutto sintetizzato).

## Avvio in locale

Serve un server statico (moduli ES):

```bash
cd chain-smoking-yart
python3 -m http.server 8000
# apri http://localhost:8000
```

## Deploy (GitHub Pages)

Gioco statico nella root del repo: *Settings → Pages → Deploy from a branch → main → / (root)*. Nessuna action.

## Struttura

```
index.html          HUD, menu, shop, credits
game.js             loop, device, risorse, accensione, shop, scena 3D, audio
vendor/             three.js r160 + GLTFLoader (MIT)
assets/models/      GLB Poly.Pizza + CREDITS.md
```

## Crediti

Modelli 3D da [Poly.Pizza](https://poly.pizza):

- **Vape** di [pgonarg](https://poly.pizza/m/kBOhB2eCji) — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0)
- **VAPE PEN - LARGE** di [Pearl Grey](https://poly.pizza/m/5CMa9iNBbAK) — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0)
- **Cigar** di [Poly by Google](https://poly.pizza/m/cT7awduBbgn) — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0)
- **Cigarette** di [Zgeal](https://poly.pizza/m/2RL6h8MbDPb) — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0)
- **Lighter** di [MaverickFX](https://poly.pizza/m/t8AmON8X5a) — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- **Smoke** di [Quaternius](https://poly.pizza/m/RReLSfPo1Q) — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- **Suspicious Plant** di [Rafael](https://poly.pizza/m/FJhXwFAoHw) — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

Renderer: [three.js](https://threejs.org) (MIT). Audio sintetizzato nel browser.

Gioco parodia, nessuna sostanza reale è coinvolta. Fai finta di essere responsabile.
