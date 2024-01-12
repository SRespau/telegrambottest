const https = require('https');
const { Telegraf, Markup } = require("telegraf");
const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')


const BOT_TOKEN = "6480434688:AAGZKd66P_j2WZ5FjvH1dc1pFZ44oC7CbSE";
const bot = new Telegraf(BOT_TOKEN);

//Variables globales
let cineSeleccionadoGlobal = null

// FUNCIONES A MOVER
function removeTextSigns(text) {
  let modifiedText = text.replace(/-/g, ' ')
  modifiedText = modifiedText.charAt(0).toUpperCase() + modifiedText.slice(1)
  return modifiedText
}

// PUPPETEER PARA CINESA PVENECIA (MOVER A FICHERO A PARTE)
async function clickSeeMoreButtons() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Navegar a la página
  await page.goto('https://www.filmaffinity.com/es/theater-showtimes.php?id=530', {waitUntil: 'load'});
  // Aceptamos las cookies
  const acceptCookiesButton = await page.$('[class=" css-v43ltw"]')
  if (acceptCookiesButton) {
    if (acceptCookiesButton) {
      await acceptCookiesButton.click();
    }
  }
  // Seleccionar y hacer clic en todos los botones con la clase "see-more"
  await page.waitForSelector('.see-more', { visible: true });
  const seeMoreButtons = await page.$$('[class="see-more"]');
  for (const button of seeMoreButtons) { 
    await button.click();
    await new Promise(resolve => setTimeout(resolve, 100)) 
  }  
  // Obtener el HTML actualizado después de hacer clic en los botones
  const updatedHTML = await page.content()

  // Usar Cheerio para analizar el HTML actualizado
  const $ = cheerio.load(updatedHTML)
  let titles = $('.mv-title')
  titles.each((index, element) => {
    // Obtener todos los nodos hijos, incluidos elementos y nodos de texto
    const childNodes = $(element).contents()
  
    // Filtrar los nodos de texto
    const textNodes = childNodes.filter(function() {
      return this.nodeType === 3; // Node.TEXT_NODE
    })
  
    // Recorrer los nodos de texto y mostrar su contenido
    textNodes.each((index, textNode) => {
      const textContent = textNode.nodeValue.trim();
      if (textContent !== "") {
        console.log(textContent);
      }
    });
  });
    // Extraer todos los li directos de la lista ul con clase ".sessions"
  const sessionsLi = $('.sessions > li');

  // Iterar sobre los li y mostrar su texto en la consola
  sessionsLi.each((index, element) => {
    const dataSessDate = $(element).attr('data-sess-date');
    console.log(dataSessDate);
  });

  // Cerrar el navegador
  await browser.close();
}
/////

const cines = Markup.inlineKeyboard([
  // 1-st column
  [Markup.button.callback('Aragonia', 'aragonia'), Markup.button.callback('Palafox', 'palafox')],
  // 2nd column
  [Markup.button.callback('Cinesa (Gran Casa)', 'grancasa'), Markup.button.callback('Cinesa (P. Venecia)', 'pvenecia')],
  // 3rd column
  [Markup.button.callback('Arte 7', 'arte7')]
]);

// Comando /start
bot.start((ctx) => {
  ctx.reply("¡Hola! Para ver la cartelera, usa el comando /cartelera");
})

// Comando /cartelera
bot.command('cartelera', (ctx) => {
  ctx.reply('¿Qué cine?', cines);
})

bot.action(['aragonia', 'palafox', 'grancasa', 'pvenecia', 'arte7'], async (ctx) => {
  // ctx.match contiene el callback_data del botón presionado
  const cineSeleccionado = ctx.match[0];
  cineSeleccionadoGlobal = cineSeleccionado
  
  switch (cineSeleccionado) {
    case 'aragonia':
    case 'palafox':
      // OBTENEMOS LOS TITULOS DE LA CARTELERA
      const response = await axios.get('https://www.cinespalafox.com/cartelera.html', {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Desactiva la verificación del certificado
      });
      const $ = cheerio.load(response.data);

      // Obtener los títulos de la cartelera
      const cartelera = $('.caption h2').map((index, element) => $(element).text().toLowerCase()).get();

      // Obtener los enlaces de la cartelera
      const linksCartelera = $('.field-content a').map((index, element) => $(element).attr('href')).get();
      linksCartelera.shift(); // Eliminar el primer elemento (no necesario según tu lógica)

      // Crear un objeto con los títulos como clave y los enlaces como valor
      const carteleraObject = {};
      cartelera.forEach((item, index) => {
        carteleraObject[item] = linksCartelera[index] || null;
      });


      // Agrupar los botones en arrays para 2 columnas
      const buttonsPerColumn = 2;
      const buttonColumns = [];
      for (let i = 0; i < cartelera.length; i += buttonsPerColumn) {
        const columnKeys = cartelera.slice(i, i + buttonsPerColumn);
        const columnButtons = columnKeys.map(key => {
          // Aplicar la expresión regular para extraer el valor entre "cartelera/" y ".html"
          const match = carteleraObject[key].match(/\/cartelera\/(.+?)\.html/);
          // Usar el valor extraído como value en el botón
          const value = match && match[1]
      
          // Crear el botón con el valor modificado
          return Markup.button.callback(removeTextSigns(key), value);
        });
      
        buttonColumns.push(columnButtons);
      }

      const inlineKeyboard = Markup.inlineKeyboard(buttonColumns);
      ctx.editMessageText("Selecciona una opción:", inlineKeyboard);

      break;
    case 'grancasa':
      ctx.editMessageText('Cinesa (Gran Casa) seleccionado');
      break;
    case 'pvenecia':
      clickSeeMoreButtons()
      break;
    case 'arte7':
      ctx.editMessageText('Arte 7 seleccionado');
      break;
    default:
      ctx.editMessageText('Opción no reconocida');
  }
});

//Leemos las peliculas con el link
bot.action(/^(?!.*\.html).*$/, async (ctx) => {
  console.log(ctx)
  const cineSeleccionado = cineSeleccionadoGlobal
  const URL = `https://www.cinespalafox.com/cartelera/${ctx.match[0]}.html`
  // OBTENEMOS LOS TITULOS DE LA CARTELERA
  const response = await axios.get(URL, {
    httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Desactiva la verificación del certificado
  });
  const $ = cheerio.load(response.data);
  
  const cineDiv = $(`.sesiones h3:contains("Cines ${cineSeleccionado === "aragonia" ? "aragonia" : "Palafox"}")`).parent();
  const primerUl = cineDiv.find('ul').first();

  const horariosData = {};
  // Iterar sobre los elementos li dentro de ul
  primerUl.find('> li').each((index, liElement) => {
    const fecha = $(liElement).text();
    // Obtener los textos dentro de los elementos a que están al mismo nivel que li
    const textos = $(liElement).next('ul').find('li a').map((index, aElement) => $(aElement).text()).get();

    horariosData[fecha] = textos;
  });

  let renderHorario = '';
  renderHorario += `${removeTextSigns(ctx.match[0]).toUpperCase()}\n`
  if(Object.keys(horariosData).length !== 0){
    for (const fecha in horariosData) {
      renderHorario += `${fecha}:\n`;
      horariosData[fecha].forEach(horario => {
        renderHorario += `  ·${horario}\n`;
      });
      renderHorario += '\n';
    }
  } else {
    renderHorario += "No hay horarios para este cine"
  }

  ctx.editMessageText(`Aqui tienes los horarios para Cines ${cineSeleccionado}`)
  ctx.reply(renderHorario)
})

// Lanzamos el bot
bot.launch().then(() => {
  console.log("Bot is running")
}).catch((error) => {
  console.error("Error launching bot:", error)
})