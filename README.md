# Como rodar o servidor

## Instalar dependências

### node

`npm install express body-parser twilio pg`

### Postgres

https://www.postgresql.org/download/

Criar as seguintes tabelas

### Ngrok

Lembrar de setar a conta também

https://ngrok.com/download

## Rodar o servidor

`node server.js`

## Rodar o ngrok

`ngrok http 3000`

## Configurar o Twilio

Após rodar o ngrok, copie o link https gerado e cole nas configurações de sandbox, com /bot no final, em "When a message comes in".

![ngrok](imgs/ngrok.png)
![twilio](imgs/twilio.png)

**Lembrando que sempre que o ngrok for rodado seu link mudará, precisando mudar também no Twilio.**

## Testar

Envie uma mensagem para o número do Twilio _+1 415 523 8886_ com a seguinte mensagem

`join throughout-certainly`

Após isso, o bot já está funcionando.
