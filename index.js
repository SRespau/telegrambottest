const https = require('https');
const { Telegraf, Markup } = require("telegraf");
const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')


const BOT_TOKEN = "6480434688:AAGZKd66P_j2WZ5FjvH1dc1pFZ44oC7CbSE";
const bot = new Telegraf(BOT_TOKEN);

//Variables globales
let cineSeleccionadoGlobal = null
let movieData = {}
let peliculasDisponibles = []

// FUNCIONES A MOVER
function removeTextSigns(text) {
  let modifiedText = text.replace(/-/g, ' ')
  modifiedText = modifiedText.charAt(0).toUpperCase() + modifiedText.slice(1)
  return modifiedText
}

// PUPPETEER PARA CINESA PVENECIA (MOVER A FICHERO APARTE)
async function clickSeeMoreButtons(ctx) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log(ctx.match[0])
  const cineId = ctx.match[0] === 'pvenecia' ? '530' : '300'

  // Navegar a la página
  await page.goto(`https://www.filmaffinity.com/es/theater-showtimes.php?id=${cineId}`, {waitUntil: 'load'});
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

  let titles = $('.movie-showtimes-n');
  titles.each((index, element) => {
    // Para cada elemento con clase .movie-showtimes-n, buscar los nodos de texto directos dentro de él
    let titleNode = $(element).find('.mv-title').contents().filter(function() {
        return this.nodeType === 3 && $(this).text().trim().length > 0;
    });

    // Obtener el texto del título y limpiarlo
    let title = $(titleNode[0]).text().trim();

    // Inicializar el objeto de sesiones para este título
    movieData[title] = {};

    // Buscar los elementos li con el atributo data-sess-date dentro de este elemento
    const sessionsLi = $(element).find('.sessions > li[data-sess-date]');
    sessionsLi.each((index, sessionElement) => {
        // Obtener el valor del atributo data-sess-date
        let sessionDate = $(sessionElement).attr('data-sess-date');
        sessionDate = new Date(sessionDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Obtener los textos de los links dentro del elemento sess-times y almacenarlos en un array
        let sessionTimes = $(sessionElement).find('.sess-times a').map((index, timeElement) => $(timeElement).text().trim()).get();

        // Agregar los datos de la sesión al objeto de datos de la película
        movieData[title][sessionDate] = sessionTimes;
    });
  });
 
  // Cerrar el navegador
  await browser.close();

  peliculasDisponibles = Object.keys(movieData);

  // Dividir las películas en dos columnas
  const columns = chunkArray(peliculasDisponibles, 2);

  // Función para dividir un array en arrays de tamaño especificado
  function chunkArray(arr, size) {
    const chunkedArr = [];
    for (let i = 0; i < arr.length; i += size) {
      chunkedArr.push(arr.slice(i, i + size));
    }
    return chunkedArr;
  }

  // Crear los botones en dos columnas
  const inlineKeyboard = Markup.inlineKeyboard(
    columns.map(column =>
      column.map(movie => Markup.button.callback(movie, movie))
    )
  );

  // Enviar mensaje con los botones
  ctx.editMessageText('Selecciona una película:', inlineKeyboard);
}


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
      clickSeeMoreButtons(ctx)
      break;
    case 'pvenecia':
      clickSeeMoreButtons(ctx)
      break;
    case 'arte7':
      ctx.editMessageText('Arte 7 seleccionado');
      break;
    default:
      ctx.editMessageText('Opción no reconocida');
  }
});

//Leemos las peliculas con el link para Aragonia y Palafox
bot.action(/^(?!.*\.html).*$/, async (ctx) => {
  const cineSeleccionado = cineSeleccionadoGlobal
  // Si hay movieData significa que no es palafox o aragonia
  if (Object.keys(movieData).length > 0) {
    const peliculaSeleccionada = ctx.match[0];

    const horarios = movieData[peliculaSeleccionada];

    if (horarios) {
      // Formatear los horarios como texto
      const horariosTexto = Object.entries(horarios).map(([fecha, horarios]) => {
        let renderHorario = ''
        horarios.forEach((horario) => {
          renderHorario += `  ·${horario}\n`
        })
        return `${fecha}:\n${renderHorario}`
      }).join('\n')

      ctx.editMessageText(`Aqui tienes los horarios para Cines ${cineSeleccionado}`)
      ctx.reply(`Horarios para ${peliculaSeleccionada.toUpperCase()}\n${horariosTexto}`);
    } else {
      ctx.editMessageText(`Lo siento, no hay horarios disponibles para ${peliculaSeleccionada}`);
    }
    
    movieData = {}

  } else {
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
    renderHorario += `Horarios para ${removeTextSigns(ctx.match[0]).toUpperCase()}\n`
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
  } 
})



// Lanzamos el bot
bot.launch().then(() => {
  console.log("Bot is running")
}).catch((error) => {
  console.error("Error launching bot:", error)
})