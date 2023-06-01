// Importando as dependências
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const { Client } = require("pg");
const MessagingResponse = twilio.twiml.MessagingResponse;

// Iniciando o servidor Express
const app = express();

// Configurando o body parser para pegar POSTS mais tarde
app.use(bodyParser.urlencoded({ extended: false }));

// Iniciando conexão com o banco de dados
const client = new Client({
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "31323036",
    port: 5432,
});
client.connect();

// Rota para receber as mensagens do zap
app.post("/bot", (req, res) => {
    const twiml = new MessagingResponse();
    const telefone = req.body.From.substring(12);

    if (req.body.Body.startsWith("SETNOME")) {
        const nomeVendedor = req.body.Body.substring(8);

        client.query(
            "INSERT INTO vendedor (nome, telefone) VALUES ($1, $2) ON CONFLICT (telefone) DO UPDATE SET nome = $1 RETURNING id_vendedor",
            [nomeVendedor, telefone],
            (err) => {
                if (err) {
                    console.log("Ocorreu um erro ao inserir os dados no banco de dados: ", err);
                    twiml.message("Ocorreu um erro ao processar sua solicitação.");
                    res.writeHead(200, { "Content-Type": "text/xml" });
                    res.end(twiml.toString());
                    return;
                }
                twiml.message(`Seu nome foi cadastrado com sucesso! Você já pode registrar suas vendas, ${nomeVendedor}!`);
                res.writeHead(200, { "Content-Type": "text/xml" });
                res.end(twiml.toString());
                return;
            }
        );
    } else {
        client.query("SELECT nome FROM vendedor WHERE telefone = $1", [telefone], (err, result) => {
            if (err) {
                console.log("Ocorreu um erro ao buscar o vendedor: ", err);
                twiml.message("Ocorreu um erro ao processar sua solicitação.");
                res.writeHead(200, { "Content-Type": "text/xml" });
                res.end(twiml.toString());
                return;
            } else if (result.rows.length === 0) {
                twiml.message("Vendedor não encontrado, cadastre-se antes de começar com\n*SETNOME seu_nome*.");
                res.writeHead(200, { "Content-Type": "text/xml" });
                res.end(twiml.toString());
                return;
            } else {
                if (req.body.Body.startsWith("+")) {
                    // Busca o id do vendedor pelo telefone
                    client.query("SELECT id_vendedor FROM vendedor WHERE telefone = $1", [telefone], (err, result) => {
                        if (err) {
                            console.log("Ocorreu um erro ao buscar o vendedor: ", err);
                            twiml.message("Ocorreu um erro ao processar sua solicitação.");
                            res.writeHead(200, { "Content-Type": "text/xml" });
                            res.end(twiml.toString());
                            return;
                        } else {
                            const idVendedor = result.rows[0].id_vendedor;
                            var tipo = req.body.Body.substring(1, 2);
                            var valorUnitario = null;
                            const quantidade = parseInt(req.body.Body.substring(2, 3));
                            if (tipo === "p" && quantidade >= 2) {
                                valorUnitario = 4;
                                tipo = "Pote";
                            } else if (tipo === "p" && quantidade === 1) {
                                valorUnitario = 5;
                                tipo = "Pote";
                            } else if (tipo === "e" && quantidade >= 2) {
                                valorUnitario = 2;
                                tipo = "Enrolado";
                            } else if (tipo === "e" && quantidade === 1) {
                                valorUnitario = 3;
                                tipo = "Enrolado";
                            } else {
                                twiml.message("Formato inválido, tente novamente.");
                                res.writeHead(200, { "Content-Type": "text/xml" });
                                res.end(twiml.toString());
                                return;
                            }
                            const valorTotal = valorUnitario * quantidade;
                            const horaVendida = new Date();
                            // Insere a venda no banco de dados
                            if (tipo === "Pote" || tipo === "Enrolado") {
                                client.query(
                                    "INSERT INTO venda (quantidade, tipo, receita, hora_vendida) VALUES ($1, $2, $3, $4) RETURNING id_venda",
                                    [quantidade, tipo, valorTotal, horaVendida],
                                    (err, result) => {
                                        if (err) {
                                            console.log("Ocorreu um erro ao inserir os dados no banco de dados: ", err);
                                            twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                            res.writeHead(200, { "Content-Type": "text/xml" });
                                            res.end(twiml.toString());
                                            return;
                                        } else {
                                            // Insere a venda do vendedor no banco de dados
                                            const idVenda = result.rows[0].id_venda;
                                            client.query(
                                                "INSERT INTO venda_vendedor (id_vendedor, id_venda) VALUES ($1, $2)",
                                                [idVendedor, idVenda],
                                                (err) => {
                                                    if (err) {
                                                        console.log("Ocorreu um erro ao inserir os dados no banco de dados: ", err);
                                                        twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                                        res.writeHead(200, { "Content-Type": "text/xml" });
                                                        res.end(twiml.toString());
                                                        return;
                                                    } else {
                                                        twiml.message(
                                                            "Venda registrada com sucesso! Informações da venda:\n" +
                                                                `Quantidade: ${quantidade}\n` +
                                                                `Tipo: ${tipo}\n` +
                                                                `Receita: R$ ${valorTotal},00\n` +
                                                                `Dia e hora: ${horaVendida.toLocaleString("pt-BR")}`
                                                        );
                                                        res.writeHead(200, { "Content-Type": "text/xml" });
                                                        res.end(twiml.toString());
                                                    }
                                                }
                                            );
                                        }
                                    }
                                );
                            }
                        }
                    });
                } else if (req.body.Body.startsWith("INFO")) {
                    // Devolva as informaçoes de venda do vendedor: nome, total de vendas, total de receita
                    // Se a entrada for INFO<N>, onde N é um inteiro, mostrar as informações das últimas N vendas do vendedor, sendo um cada linha com tipo, quantidade, receita e hora
                    if (req.body.Body.length > 4 && req.body.Body.substring(4, 5) !== " ") {
                        const quantidadeVendas = parseInt(req.body.Body.substring(4));
                        client.query(
                            "SELECT venda.id_venda, venda.tipo, venda.quantidade, venda.receita, venda.hora_vendida FROM vendedor INNER JOIN venda_vendedor ON vendedor.id_vendedor = venda_vendedor.id_vendedor INNER JOIN venda ON venda_vendedor.id_venda = venda.id_venda WHERE vendedor.telefone = $1 ORDER BY venda.hora_vendida DESC LIMIT $2",
                            [telefone, quantidadeVendas],
                            (err, result) => {
                                if (err) {
                                    console.log("Ocorreu um erro ao buscar o vendedor: ", err);
                                    twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                    return;
                                } else if (result.rows.length === 0) {
                                    twiml.message("Venda(s) não encontrada(as)");
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                    return;
                                } else {
                                    let mensagem = `Informações das suas últimas ${quantidadeVendas} vendas:`;
                                    for (let i = 0; i < result.rows.length; i++) {
                                        const idVenda = result.rows[i].id_venda;
                                        const tipo = result.rows[i].tipo;
                                        const quantidade = result.rows[i].quantidade;
                                        const receita = result.rows[i].receita;
                                        const horaVendida = result.rows[i].hora_vendida;
                                        mensagem +=
                                            `\n\nVenda ${idVenda}:\n` +
                                            `Tipo: ${tipo}\n` +
                                            `Quantidade: ${quantidade}\n` +
                                            `Receita: R$ ${receita},00\n` +
                                            `Dia e hora: ${horaVendida.toLocaleString("pt-BR")}`;
                                    }
                                    twiml.message(mensagem);
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                }
                            }
                        );
                        return;
                    } else {
                        client.query(
                            "SELECT vendedor.nome, SUM(venda.receita) AS receita_total, COUNT(venda.id_venda) AS total_vendas FROM vendedor INNER JOIN venda_vendedor ON vendedor.id_vendedor = venda_vendedor.id_vendedor INNER JOIN venda ON venda_vendedor.id_venda = venda.id_venda WHERE vendedor.telefone = $1 GROUP BY vendedor.nome",
                            [telefone],
                            (err, result) => {
                                if (err) {
                                    console.log("Ocorreu um erro ao buscar o vendedor: ", err);
                                    twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                    return;
                                } else if (result.rows.length === 0) {
                                    twiml.message("Vendas não encontradas.");
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                    return;
                                } else {
                                    const nomeVendedor = result.rows[0].nome;
                                    const receitaTotal = result.rows[0].receita_total;
                                    const totalVendas = result.rows[0].total_vendas;
                                    twiml.message(
                                        `Informações do vendedor:\n` +
                                            `Nome: ${nomeVendedor}\n` +
                                            `Total de vendas: ${totalVendas}\n` +
                                            `Receita total: R$ ${receitaTotal},00`
                                    );
                                    res.writeHead(200, { "Content-Type": "text/xml" });
                                    res.end(twiml.toString());
                                }
                            }
                        );
                    }
                } else if (req.body.Body.startsWith("CANCELAR")) {
                    client.query(
                        "SELECT vendedor.nome, venda.receita, venda.id_venda, venda.hora_vendida FROM vendedor INNER JOIN venda_vendedor ON vendedor.id_vendedor = venda_vendedor.id_vendedor INNER JOIN venda ON venda_vendedor.id_venda = venda.id_venda WHERE vendedor.telefone = $1 ORDER BY venda.hora_vendida DESC LIMIT 1",
                        [telefone],
                        (err, result) => {
                            if (err) {
                                console.log("Ocorreu um erro ao buscar o vendedor: ", err);
                                twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                res.writeHead(200, { "Content-Type": "text/xml" });
                                res.end(twiml.toString());
                                return;
                            } else if (result.rows.length === 0) {
                                twiml.message("Venda não encontrada.");
                                res.writeHead(200, { "Content-Type": "text/xml" });
                                res.end(twiml.toString());
                                return;
                            } else {
                                const nomeVendedor = result.rows[0].nome;
                                const receita = result.rows[0].receita;
                                const idVenda = result.rows[0].id_venda;
                                const horaVendida = result.rows[0].hora_vendida;
                                client.query("DELETE FROM venda WHERE id_venda = $1", [idVenda], (err) => {
                                    if (err) {
                                        console.log("Ocorreu um erro ao inserir os dados no banco de dados: ", err);
                                        twiml.message("Ocorreu um erro ao processar sua solicitação.");
                                        res.writeHead(200, { "Content-Type": "text/xml" });
                                        res.end(twiml.toString());
                                        return;
                                    } else {
                                        twiml.message(
                                            `Venda cancelada com sucesso! Informações da venda:\n` +
                                                `Vendedor: ${nomeVendedor}\n` +
                                                `Receita: R$ ${receita},00\n` +
                                                `Dia e hora: ${horaVendida.toLocaleString("pt-BR")}`
                                        );
                                        res.writeHead(200, { "Content-Type": "text/xml" });
                                        res.end(twiml.toString());
                                    }
                                });
                            }
                        }
                    );
                } else {
                    twiml.message(
                        "- Olá, para registrar uma venda, envie uma mensagem com o seguinte formato:\n *+<TIPO><QUANTIDADE>*." +
                            "\nOnde *<TIPO>* é *p* para pote e *e* para enrolado e *<QUANTIDADE>* é a quantidade de potes ou enrolados vendidos." +
                            "\nExemplo: *+p2* para registrar a venda de 2 potes ou *+e1* para registrar a venda de 1 enrolado." +
                            "\n- Para cancelar a última venda, envie uma mensagem com o seguinte formato: *CANCELAR*." +
                            "\n- Para obter informações sobre suas vendas totais, envie uma mensagem com o seguinte formato: *INFO*." +
                            "\nOpcionalmente, insira um número n logo após INFO para obter informações das ultimas n vendas. Exemplo: *INFO<n>*" +
                            "\n- Para se cadastrar ou alterar seu nome, envie uma mensagem com o seguinte formato: *SETNOME SEU_NOME*"
                    );
                    res.writeHead(200, { "Content-Type": "text/xml" });
                    res.end(twiml.toString());
                }
            }
        });
    }
});

app.listen(3000, () => {
    console.log("Servidor iniciado na porta 3000");
});
