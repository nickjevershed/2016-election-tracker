import iframeMessenger from 'guardian/iframe-messenger'
import reqwest from 'reqwest'
import embedHTML from './text/embed.html!text'
import d3 from 'd3'
import moment from 'moment'
import { AUSCartogram } from './campaignMap'
import { BarGraph } from './barGraph'
import { TableSortable } from './tableSortable'
import { EventsList } from './eventsList'
import animateSprite from './vendor/jquery.animateSprite.min'
import sprites from './sprites'
import noUiSlider from './vendor/nouislider.min'
import campaignData from './data/events-categorised.json!json'


window.init = function init(el, config) {
  iframeMessenger.enableAutoResize()
  el.innerHTML = embedHTML.replace(/%assetPath%/g, config.assetPath);
  var req;
  req = reqwest({
    url: 'https://interactive.guim.co.uk/docsdata/1FlcOz_QsPE0KolAUB_v1jYVYaKCbh-1VuJcBYwfm86I.json',
    type: 'json',
    crossOrigin: true,
    success: resp => handleData(el, req.request.getResponseHeader('Last-Modified'), resp)
  });
}


function handleData(el, date, data) {
    var timestampFormat = d3.time.format("%A %B %d, %H:%M AEST")
    var dateFormat = d3.time.format("%Y-%m-%d")
    d3.select("#timeStamp").text(timestampFormat(new Date(date)))

    var rollinGraphic = $("#rollin-graphic")
    var go = true
    rollinGraphic.bind("animationend webkitAnimationEnd oAnimationEnd MSAnimationEnd", () => {
      rollinGraphic.addClass("transitioned")
      if (go) { roll() }
    })

    $(window).on('scroll', roll)

    function roll() {
      if (rollinGraphic.is(".rollout.transitioned") && $(window).scrollTop() < 20) {
        rollinGraphic.removeClass("rollout transitioned").addClass("rollin")
        go = false
      } else if (rollinGraphic.is(".rollin.transitioned") && $(window).scrollTop() > 20){
        rollinGraphic.removeClass("rollin transitioned").addClass("rollout")
        go = false
      }
      else if ($(window).scrollTop() < 10) { go = true }
    }

    var laborLeader = 'Bill Shorten'
    var coalitionLeader = 'Malcolm Turnbull'

    var dataByLeader = d3.nest()
      .key((d) => d.politician)
      .entries(data.sheets.events)

    var eventsByLeader = d3.nest()
      .key((d) => d.politician)
      .key((d) => d.date)      
      .key((d) => d.event)      
      .entries(data.sheets.events)

    var visitsByLeader = d3.nest()
      .key((d) => d.politician)
      .key((d) => d.electorate)
      .key((d) => d.date)
      .entries(data.sheets.events)

    var dataByCategory = d3.nest()
      .key((d) => d.politician)
      .key((d) => d.category)
      .rollup((l) => {
        var marginal = l.filter((a) => a.status === 'Marginal')
        var fairlySafe = l.filter((a) => a.status === 'Fairly safe')
        var safe = l.filter((a) => a.status === 'Safe')
        return { 
          all: {count: l.length, sum: d3.sum(l, (a) => +a["dollars-announced"])},
          safe: {count: safe.length, sum: d3.sum(safe, (a) => +a["dollars-announced"]) },
          marginal: {count: marginal.length, sum: d3.sum(marginal, (a) => +a["dollars-announced"]) },
          fairlySafe: {count: fairlySafe.length, sum: d3.sum(fairlySafe, (a) => +a["dollars-announced"]) }
        }
      })
      .entries(data.sheets.events)

    var maxVisitsByCategory = d3.max(dataByCategory, (p) => d3.max(p.values, (d) => d.values.all.count))
    var maxAmountByCategory = d3.max(dataByCategory, (p) => d3.max(p.values, (d) => d.values.all.sum))
    var maxVisitsByElectorate = d3.max(visitsByLeader, (p) => d3.max(p.values, (d) => d.values.length))
    var dateExtent = d3.extent(data.sheets.events, (d) => dateFormat.parse(d.date))
    var dataByLeaderMap = d3.map(dataByLeader, (d) => d.key)
    var categoriesMap = d3.map(dataByCategory, (d) => d.key)
    var electorateMap = d3.map(visitsByLeader, (d) => d.key)
    var eventsMap = d3.map(eventsByLeader, (d) => d.key)

    var numElectorates = {
      labor: electorateMap.get(laborLeader).values.length,
      coalition: electorateMap.get(coalitionLeader).values.length
    }

    var numAnnouncements = {
      labor: dataByLeaderMap.get(laborLeader).values.length,
      coalition: dataByLeaderMap.get(coalitionLeader).values.length
    }

    var sumCost = {
      labor: d3.sum(dataByLeaderMap.get(laborLeader).values, (d) => +d["dollars-announced"]),
      coalition: d3.sum(dataByLeaderMap.get(coalitionLeader).values, (d) => +d["dollars-announced"])
    }

    var categoryFocus = {
      labor: categoriesMap.get(laborLeader).values.reduce((a,b) => a.values.all.count > b.values.all.count ? a : b),
      coalition: categoriesMap.get(coalitionLeader).values.reduce((a,b) => a.values.all.count > b.values.all.count ? a : b)
    }

    var categoryCost = {
      labor: categoriesMap.get(laborLeader).values.reduce((a,b) => a.values.all.sum > b.values.all.sum ? a : b),
      coalition: categoriesMap.get(coalitionLeader).values.reduce((a,b) => a.values.all.sum > b.values.all.sum ? a : b)
    }

    d3.select("#summary-labor .summary-text")
      .html(summaryText(numElectorates.labor, numAnnouncements.labor, d3.format(".3r")(sumCost.labor/1000000000), categoryFocus.labor.key, categoryCost.labor.key))
    d3.select("#summary-coalition .summary-text")
      .html(summaryText(numElectorates.coalition, numAnnouncements.coalition, d3.format(".3r")(sumCost.coalition/1000000000), categoryFocus.coalition.key, categoryCost.coalition.key))

    var laborBar = new BarGraph("#promises-labor", categoriesMap.get(laborLeader).values, maxVisitsByCategory, maxAmountByCategory, '#b51800')
    var coalitionBar = new BarGraph("#promises-coalition", categoriesMap.get(coalitionLeader).values, maxVisitsByCategory, maxAmountByCategory, "#005689")
   
    var laborEvents = new EventsList("#events-labor", eventsMap.get(laborLeader).values)
    var coalitionEvents = new EventsList("#events-coalition", eventsMap.get(coalitionLeader).values)

    var coalitionMap = new AUSCartogram("#campaign-map-coalition", electorateMap.get(coalitionLeader).values, maxVisitsByElectorate, "#005689")
    var laborMap = new AUSCartogram("#campaign-map-labor", electorateMap.get(laborLeader).values, maxVisitsByElectorate, '#b51800')

    var dateScale = d3.time.scale().domain(dateExtent)
    var dateControlDisplayFormat = d3.time.format("%A, %d %B")
    dateScale.range([0, dateScale.ticks(d3.time.days, 1).length])
    var slider = el.querySelector('#slider')
    noUiSlider.create(slider, {
      start: dateScale.ticks(d3.time.days, 1).length,
      step: 1,
      animate:true,
      connect: 'lower',
      range: {
          'min': 0,
          'max': dateScale.ticks(d3.time.days, 1).length
      }
    })

    laborEvents.render(dateScale.invert(0))
    coalitionEvents.render(dateScale.invert(0))

    slider.noUiSlider.on('update', function( value ) {
      var dateRaw = dateScale.invert(value[0])
      var date = dateControlDisplayFormat(dateRaw)
      el.querySelector('#date-control-text').innerHTML = `On ${date}&hellip;`;
      coalitionMap.renderDateFilter(dateRaw)
      laborMap.renderDateFilter(dateRaw)
      laborEvents.render(dateRaw)
      coalitionEvents.render(dateRaw)    
    });

    // toggle buttons for bar graphs
    // var promisesBtn = d3.selectAll(".toggle-mode a")
    //   .on("click", function() {
    //     var mode = d3.select(this).attr("data-mode")

    //     laborBar.toggleMode(mode)
    //     coalitionBar.toggleMode(mode)
    //     d3.selectAll(".toggle-mode a")
    //       .classed("selected", false)
    //     d3.select(this).classed("selected", true)
    //   })

    var statusBtn = d3.selectAll(".toggle-status a")
      .on("click", function() {
        var status = d3.select(this).attr("data-status")
        laborBar.filterStatus(status)
        coalitionBar.filterStatus(status)
        d3.selectAll(".toggle-status a")
          .classed("selected", false)
        d3.select(this).classed("selected", true)
      })

    new TableSortable("#announcements-detail", data.sheets.events)
    setupAnimations()
    shortenBlink()
    turnbullBlink()

    var to=null
    var lastWidth = document.querySelector(".interactive-container").getBoundingClientRect()
    window.addEventListener('resize', () => {
      var thisWidth = document.querySelector(".interactive-container").getBoundingClientRect()
      if (lastWidth != thisWidth) {
        window.clearTimeout(to);
        to = window.setTimeout(resize(), 500)
      }
    })

    function resize() {
      coalitionMap.resize()
      laborMap.resize()
      coalitionBar.resize()
      laborBar.resize()
    }

    function summaryText(electorates, announcements, cost, categoryFocus, categoryCost) {
      // text with spending --->
      // var text = `Has visited <span class="figure-txt">${electorates} electorates</span>,` +
      //   ` and made <span class="figure-txt">${announcements} announcements</span> ` + 
      //   ` with an estimated total cost* of <span class="figure-txt">$${cost}bn</span>. 

      var text = `Has visited <span class="figure-txt">${electorates} electorates</span>,` +
        ` and made <span class="figure-txt">${announcements} announcements</span>.` 

      text = text + ` His major focus is <span class="category">${categoryFocus}</span>.`

      // if (categoryFocus === categoryCost) {
      //   text = text + `His major focus is <span class="category">${categoryFocus}</span>.`
      // } 
      // else {
      //   text = text + `His major focus is <span class="category">${categoryFocus}</span>` +
      //     ` but has committed the most money to <span class="category">${categoryCost}</span>.`
      // }
      return text
    }
}