import cors from 'cors';
import express from 'express';
require('dotenv').config();
const dated = require('date-and-time');
import { parseISO } from 'date-fns';
import axios from 'axios';

// Token de acesso
const mercadoPagoToken = process.env.MP_TOKEN;
const PORT: string | number = process.env.PORT || 5001;

const app = express();
app.use(cors());
app.use(express.json());

// Configuração única
const PRECO_FIXO = 5.00;
const COMPARTIMENTO_FIXO = "01";

// Função para validar o valor
function validarPagamento(valor: number): boolean {
    return valor === PRECO_FIXO;
}

// Variáveis de controle
let valorRecebido = 0;
let liberarProduto = false;

// Consulta do ESP32
app.get("/consulta-maquina", (req, res) => {
    if (liberarProduto) {
        liberarProduto = false;
        return res.status(200).json({ retorno: "00" + COMPARTIMENTO_FIXO });
    }
    return res.status(200).json({ retorno: "0000" });
});

// Simulação de recebimento manual (útil para testes)
app.get("/rota-recebimento-teste", (req, res) => {
  const valorStr = req.query.valor;
  if (typeof valorStr !== 'string') {
    return res.status(400).json({ mensagem: "Valor ausente ou inválido" });
  }

  const valor = parseFloat(valorStr);
  if (validarPagamento(valor)) {
    valorRecebido = valor;
    liberarProduto = true;
    return res.status(200).json({ mensagem: "ok" });
  } else {
    return res.status(400).json({ mensagem: "Valor inválido" });
  }
});

// Webhook Mercado Pago
app.post("/rota-recebimento-mercado-pago", async (req, res) => {
  console.log("Recebido webhook:");
  console.log(JSON.stringify(req.body, null, 2));
  
  const pagamentoId = req.query.id;
  console.log("ID recebido no webhook:", pagamentoId);

  if (!pagamentoId) {
    return res.status(400).json({ erro: "ID ausente" });
  }

  try {
    const url = `https://api.mercadopago.com/v1/payments/${pagamentoId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${mercadoPagoToken}` }
    });

        const pagamento = response.data;

        if (pagamento.status !== "approved") {
            console.log("Pagamento não aprovado");
            return res.sendStatus(200);
        }

        const valor = pagamento.transaction_amount;

        if (validarPagamento(valor)) {
            valorRecebido = valor;
            liberarProduto = true;
            console.log("Produto liberado com pagamento de R$", valor);
        } else {
            console.warn("Valor inválido recebido:", valor);
            await axios.post(`https://api.mercadopago.com/v1/payments/${pagamentoId}/refunds`, {}, {
                headers: {
                    Authorization: `Bearer ${mercadoPagoToken}`
                }
            });
            console.log("Estorno realizado por valor inválido");
        }

    } catch (err) {
        console.error("Erro no webhook:", err);
    }

    res.status(200).json({ mensagem: "ok" });
});

app.listen(PORT, () => console.log(`Servidor rodando em localhost:${PORT}`));
