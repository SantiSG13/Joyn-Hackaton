// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title FondoBarrio - Plataforma de micro-mecenazgo "Play-to-Donate" sobre Monad Testnet
/// @notice Permite donaciones directas y aportes vía minijuego patrocinado, con desembolsos transparentes.
contract FondoBarrio {

    // ──────────────────────────────────────────────
    //   Estado (Storage)
    // ──────────────────────────────────────────────

    address public representante;       // Wallet autorizada a desembolsar
    string  public causa;                // Descripción de la causa activa
    uint256 public meta;                 // Monto total a recaudar (en wei)
    uint256 public totalRecaudado;       // Avance acumulado en tiempo real
    uint256 public aportePorPartida;    // Aporte fijo liberado por victoria
    uint256 public totalPartidas;        // Contador de partidas jugadas
    uint256 public totalDonantes;        // Contador de donantes únicos

    mapping(address => uint256) public aportesDonantes;       // Cuánto donó cada地址
    mapping(address => uint256) public partidasPorJugador;   // Partidas ganadas por jugador
    mapping(address => bool)    private _haDonado;           // Para contar donantes únicos

    // ──────────────────────────────────────────────
    //   Eventos (Transparencia on-chain)
    // ──────────────────────────────────────────────

    event DonacionRecibida(address indexed donante, uint256 monto);
    event PartidaCompletada(address indexed jugador, uint256 aporteLiberado);
    event FondosDesembolsados(address indexed destino, uint256 monto, string concepto);
    event CausaActualizada(string nuevaCausa, uint256 nuevaMeta);

    // ──────────────────────────────────────────────
    //   Modifier
    // ──────────────────────────────────────────────

    modifier soloRepresentante() {
        require(msg.sender == representante, "Solo el representante puede ejecutar esta accion");
        _;
    }

    // ──────────────────────────────────────────────
    //   Constructor
    // ──────────────────────────────────────────────

    /// @param _causa           Nombre o descripción de la causa
    /// @param _meta            Monto objetivo a recaudar (en wei)
    /// @param _aportePorPartida Aporte fijo que libera el patrocinador por partida ganada (en wei)
    constructor(
        string memory _causa,
        uint256 _meta,
        uint256 _aportePorPartida
    ) {
        require(_meta > 0, "La meta debe ser mayor a 0");
        representante = msg.sender;
        causa = _causa;
        meta = _meta;
        aportePorPartida = _aportePorPartida;
    }

    // ──────────────────────────────────────────────
    //   2. Módulo de Donaciones Directas
    // ──────────────────────────────────────────────

    /// @notice Permite a cualquier usuario donar $MON directamente al fondo
    function donar() external payable {
        require(msg.value > 0, "La donacion debe ser mayor a 0");

        totalRecaudado += msg.value;
        aportesDonantes[msg.sender] += msg.value;

        if (!_haDonado[msg.sender]) {
            _haDonado[msg.sender] = true;
            totalDonantes++;
        }

        emit DonacionRecibida(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //   3. Módulo Play-to-Donate (Gamificación)
    // ──────────────────────────────────────────────

    /// @notice Registra una partida ganada y recibe el precio elegido por el jugador
    function registrarPartida() external payable {
        require(msg.value > 0, "El precio de la partida debe ser mayor a 0");

        totalRecaudado += msg.value;
        aportesDonantes[msg.sender] += msg.value;
        if (!_haDonado[msg.sender]) {
            _haDonado[msg.sender] = true;
            totalDonantes++;
        }
        totalPartidas++;
        partidasPorJugador[msg.sender]++;

        emit PartidaCompletada(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //   4. Módulo de Desembolso / Gastos Transparentes
    // ──────────────────────────────────────────────

    /// @notice Transfiere fondos a un proveedor/destino y registra el gasto públicamente
    /// @param _destino  Dirección del proveedor o beneficiario del pago
    /// @param _monto    Cantidad a transferir (en wei)
    /// @param _concepto Motivo o descripción del gasto
    function desembolsar(
        address _destino,
        uint256 _monto,
        string memory _concepto
    ) external soloRepresentante {
        require(_destino != address(0), "Destino invalido");
        require(_monto > 0, "El monto debe ser mayor a 0");
        require(address(this).balance >= _monto, "Saldo del contrato insuficiente");

        (bool ok, ) = _destino.call{value: _monto}("");
        require(ok, "Transferencia fallida");

        emit FondosDesembolsados(_destino, _monto, _concepto);
    }

    // ──────────────────────────────────────────────
    //   Administración (solo representante)
    // ──────────────────────────────────────────────

    /// @notice Actualiza la causa y la meta del fondo
    function actualizarCausa(string memory _nuevaCausa, uint256 _nuevaMeta) external soloRepresentante {
        require(_nuevaMeta > 0, "La meta debe ser mayor a 0");
        causa = _nuevaCausa;
        meta = _nuevaMeta;
        emit CausaActualizada(_nuevaCausa, _nuevaMeta);
    }

    /// @notice Actualiza el aporte por partida
    function setAportePorPartida(uint256 _nuevoAporte) external soloRepresentante {
        aportePorPartida = _nuevoAporte;
    }

    /// @notice Transfiere la titularidad del representante
    function transferirRepresentante(address _nuevoRepresentante) external soloRepresentante {
        require(_nuevoRepresentante != address(0), "Direccion invalida");
        representante = _nuevoRepresentante;
    }

    // ──────────────────────────────────────────────
    //   Vistas / Helpers
    // ──────────────────────────────────────────────

    /// @notice Devuelve el saldo disponible en el contrato
    function saldoContrato() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Devuelve el progreso de recaudación en porcentaje (base 10000 = 100%)
    function progresoPorcentaje() external view returns (uint256) {
        if (meta == 0) return 0;
        return (totalRecaudado * 10000) / meta;
    }
}
