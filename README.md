# Joyn — Juega, dona y transforma tu comunidad

Joyn es una dApp de donaciones sobre Monad Testnet. Permite consultar una causa comunitaria, realizar donaciones en ETH/MON, desbloquear un minijuego después de donar y gestionar desembolsos desde la wallet representante.

> **Estado actual:** el juego es gratuito después de una donación acumulada mínima de `0.001 ETH`. El frontend no ejecuta `registrarPartida` al jugar. La función permanece en el contrato por compatibilidad con el contrato desplegado.

## Contrato desplegado

Esta es la dirección del contrato `FondoBarrio` que utiliza actualmente la aplicación:

```text
0x337a659836EB67B435a8D45Ac5919976A1B466d1
```

- **Red:** Monad Testnet
- **Explorador:** [Ver FondoBarrio en Monad Explorer](https://testnet.monadexplorer.com/address/0x337a659836EB67B435a8D45Ac5919976A1B466d1)

Los jurados deben revisar la dirección en **Monad Testnet**. Si el contrato se vuelve a desplegar, esta dirección cambiará y también deberá actualizarse en [frontend/index.html](./frontend/index.html) y en esta sección.

## Contenido

- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos](#requisitos)
- [Ejecutar localmente](#ejecutar-localmente)
- [Contrato FondoBarrio](#contrato-fondobarrio)
- [Configurar la dirección y el ABI](#configurar-la-dirección-y-el-abi)
- [Usar la aplicación](#usar-la-aplicación)
- [Desplegar o actualizar el contrato](#desplegar-o-actualizar-el-contrato)
- [Conversión ETH/MON a wei](#conversión-ethmon-a-wei)
- [Solución de problemas](#solución-de-problemas)
- [Consideraciones de seguridad](#consideraciones-de-seguridad)

## Arquitectura

```text
MetaMask ────────┐
                 ├── React + ethers.js ── FondoBarrio.sol ── Monad Testnet
RPC público ─────┘
```

- **Frontend:** React, Vite, ethers.js y un juego Canvas.
- **Blockchain:** contrato Solidity `FondoBarrio`.
- **Lecturas públicas:** `https://testnet-rpc.monad.xyz`.
- **Transacciones:** MetaMask mediante `window.ethereum`.
- **Red:** Monad Testnet. MetaMask debe estar conectada a la misma red para donar o desembolsar.

## Estructura del proyecto

```text
Joys/
├── contracts/
│   └── FondoBarrio.sol              # Contrato principal
├── artifacts/
│   ├── FondoBarrio.json             # ABI y bytecode generado
│   └── FondoBarrio_metadata.json    # Metadata de compilación
├── frontend/
│   ├── index.html                   # Dirección y ABI usados por la dApp
│   └── src/
│       ├── App.jsx                  # Estado, wallet, donaciones y UI
│       ├── WaterGame.jsx            # Minijuego de atrapar gotas
│       ├── index.css                # Estilos
│       └── main.jsx                 # Punto de entrada de React
├── dapp.config.json                 # Configuración generada por Quick DApp
├── remix.config.json                # Configuración de Remix
└── README.md
```

Los directorios `node_modules`, `frontend/dist` y `frontend/.vite` son archivos generados. No se deben editar manualmente.

## Requisitos

- Node.js 18 o superior.
- npm/npx.
- MetaMask u otra wallet compatible con `window.ethereum`.
- ETH/MON de prueba en Monad Testnet para pagar gas y donar.
- Remix IDE para compilar y desplegar el contrato.

El proyecto actual no contiene un `package.json` de aplicación; las dependencias ya instaladas en el workspace incluyen React, React DOM, ethers y Vite. Si se prepara una instalación limpia, instala esas dependencias antes de ejecutar los comandos de Vite:

```powershell
npm install react react-dom ethers
npm install --save-dev vite
```

## Ejecutar localmente

Desde la carpeta raíz del proyecto:

```powershell
npx vite --host 127.0.0.1 frontend
```

Abre:

```text
http://127.0.0.1:5173/
```

Para generar una compilación de producción:

```powershell
npx vite build frontend
```

Después de cambiar la dirección del contrato o el ABI, recarga con `Ctrl + F5` para evitar usar archivos antiguos en caché.

## Contrato FondoBarrio

El contrato está en [contracts/FondoBarrio.sol](./contracts/FondoBarrio.sol).

### Constructor

Al desplegar se solicitan:

```solidity
constructor(
    string memory _causa,
    uint256 _meta,
    uint256 _aportePorPartida
)
```

- `_causa`: nombre o descripción inicial.
- `_meta`: meta en wei.
- `_aportePorPartida`: valor reservado para el módulo antiguo de partidas; usar `0` si el juego no cobra por jugar.

### Funciones principales

| Función | Tipo | Uso |
|---|---|---|
| `donar()` | `payable` | Registra una donación y actualiza el total recaudado. |
| `aportesDonantes(address)` | `view` | Consulta cuánto ha donado una wallet. |
| `actualizarCausa(string, uint256)` | Representante | Cambia el nombre y la meta de la causa. |
| `desembolsar(address, uint256, string)` | Representante | Envía fondos del contrato a un destino. |
| `saldoContrato()` | `view` | Consulta el saldo del contrato. |
| `progresoPorcentaje()` | `view` | Devuelve el progreso con escala `10000 = 100%`. |
| `registrarPartida()` | `payable` | Función histórica de pago por partida; el frontend actual no la llama. |

Solo la wallet guardada en `representante` puede ejecutar las funciones administrativas.

## Configurar la dirección y el ABI

La dApp toma su configuración desde `window.__QUICK_DAPP_CONFIG__` en [frontend/index.html](./frontend/index.html).

La parte importante es:

```js
primaryContractId: "FondoBarrio",
contracts: [
  {
    id: "FondoBarrio",
    address: "0x337a659836EB67B435a8D45Ac5919976A1B466d1",
    abi: [/* ABI del contrato */]
  }
]
```

Cuando se despliega otro contrato:

1. Copia la dirección completa que muestra Remix.
2. Reemplaza `address` en `frontend/index.html`.
3. Reemplaza el ABI completo si el contrato cambió.
4. Comprueba que MetaMask esté en la red donde se desplegó la dirección.
5. Ejecuta `Ctrl + F5`.

La dirección debe ser la del contrato de la misma red. Una dirección válida en otra red produce errores como `no code found at address` o lecturas vacías.

## Usar la aplicación

### Consultar la causa

La página lee automáticamente `causa`, `meta`, `totalRecaudado`, `totalDonantes` y `saldoContrato` desde el contrato.

### Donar

1. Pulsa **Conectar Billetera**.
2. Selecciona una cantidad o escríbela en ETH.
3. Pulsa **Donar ahora**.
4. Confirma la transacción en MetaMask.
5. Espera la confirmación.

El frontend usa:

```js
const wei = ethers.parseEther(donarAmount)
await contrato.donar({ value: wei })
```

### Desbloquear el juego

El juego de atrapar gotas se desbloquea cuando la wallet conectada tiene acumulado al menos:

```text
0.001 ETH
```

La comprobación se hace leyendo:

```js
contrato.aportesDonantes(account)
```

El acceso queda asociado al historial on-chain de esa wallet, no al navegador. Cambiar de dispositivo no elimina el acceso, siempre que se conecte la misma wallet y el contrato conserve ese registro.

### Actualizar la causa y la meta

La función existente es:

```solidity
actualizarCausa("Nueva causa", META_EN_WEI)
```

Se ejecuta desde Remix con la wallet representante. Esta función cambia la meta, pero no reinicia `totalRecaudado`.

### Desembolsar fondos

El representante puede usar el panel de desembolso de la aplicación. Debe indicar:

- Dirección de destino.
- Monto en ETH/MON.
- Concepto del gasto.

El frontend llama:

```js
contrato.desembolsar(destino, montoWei, concepto)
```

## Desplegar o actualizar el contrato

1. Abre [Remix](https://remix.ethereum.org).
2. Crea o abre `FondoBarrio.sol`.
3. Copia el contenido de `contracts/FondoBarrio.sol`.
4. Selecciona un compilador compatible con `pragma solidity ^0.8.0`.
5. Compila el contrato.
6. En **Deploy & Run Transactions**, selecciona `Injected Provider - MetaMask`.
7. Confirma que MetaMask esté en Monad Testnet.
8. Introduce los parámetros del constructor.
9. Pulsa **Deploy** y confirma la transacción.
10. Copia la dirección desplegada.
11. Actualiza `frontend/index.html`.
12. Ejecuta `npx vite build frontend` o reinicia el servidor local.

Si se despliega una nueva dirección, las donaciones y los datos de la dirección anterior no se migran automáticamente.

## Conversión ETH/MON a wei

Solidity almacena los valores de moneda en wei. La aplicación convierte los valores escritos en ETH mediante `ethers.parseEther`.

| Valor visible | Valor para un parámetro `uint256` |
|---:|---:|
| `0.000001 ETH` | `1000000000` |
| `0.00001 ETH` | `10000000000` |
| `0.0001 ETH` | `100000000000000` |
| `0.001 ETH` | `1000000000000000` |
| `0.01 ETH` | `10000000000000000` |
| `0.1 ETH` | `100000000000000000` |
| `1 ETH` | `1000000000000000000` |

Por ejemplo, para una meta de `0.01 ETH` en Remix:

```text
actualizarCausa("Inundación", 10000000000000000)
```

El frontend debería mostrar `Meta: 0.01 ETH`.

## Solución de problemas

### La página aparece en blanco

- Revisa la consola del navegador.
- Confirma que `frontend/index.html` tenga `window.__QUICK_DAPP_CONFIG__`.
- Confirma que exista un contrato con `id: "FondoBarrio"`.
- Ejecuta nuevamente `npx vite build frontend`.
- Recarga con `Ctrl + F5`.

### Aparece `no code found at address`

La dirección no tiene bytecode en la red seleccionada. Comprueba:

- Red activa en MetaMask.
- Dirección copiada completa desde Remix.
- Dirección configurada en `frontend/index.html`.
- Que el contrato se haya desplegado realmente en esa red.

### Los valores aparecen en cero

El RPC no pudo leer el contrato o la dirección es incorrecta. La página usa:

```text
https://testnet-rpc.monad.xyz
```

Comprueba la dirección en Remix y revisa la consola del navegador.

### El porcentaje muestra un número enorme

`progresoPorcentaje()` devuelve una escala donde `10000` equivale a `100%`. El frontend convierte el resultado dividiéndolo entre `100`. Si se modifica el contrato, hay que conservar esa convención o actualizar el frontend.

### MetaMask no muestra una transacción

- La acción debe ser una operación que modifica el contrato.
- La wallet debe estar conectada.
- La red de MetaMask debe coincidir con la red del contrato.
- Debes tener saldo suficiente para gas.
- El campo de monto debe ser mayor que cero.

### El juego sigue bloqueado

- Conecta la wallet que realizó la donación.
- Confirma que la donación fue confirmada en la blockchain.
- Comprueba que `aportesDonantes(wallet)` sea al menos `0.001 ETH`.
- Recarga después de la confirmación.

### Error `eth_newFilter`

Algunos RPC públicos no soportan filtros de eventos. La aplicación usa el RPC público para lecturas y limita los listeners de eventos a proveedores compatibles con `window.ethereum`.

## Consideraciones de seguridad

- Nunca guardes claves privadas, frases semilla ni credenciales en este proyecto.
- Verifica siempre la dirección y la red antes de donar o desembolsar.
- El contrato no permite recuperar fondos enviados a una dirección equivocada.
- `representante` tiene permisos administrativos importantes.
- Desplegar un contrato nuevo crea un estado independiente del contrato anterior.
- El ABI no despliega ni modifica un contrato; solo describe cómo interactuar con él.

## Licencia

El contrato declara licencia MIT mediante SPDX:

```solidity
// SPDX-License-Identifier: MIT
```
