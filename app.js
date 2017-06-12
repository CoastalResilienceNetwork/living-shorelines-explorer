
define([
	    "dojo/_base/declare",
		"d3",
		"use!underscore",
		"dojo/json",
		"dojo/parser",
		"dojo/on",
		"dojo/aspect",
		"dojo/_base/array",
		"dojo/_base/html",
		"dojo/_base/window",
		"dojo/query",
		"dojo/dom",
		"dojo/dom-class",
		"dojo/dom-style",
		"dojo/dom-attr",
		"dojo/dom-construct",
		"dojo/dom-geometry",
		"dojo/_base/fx",
		"dojo/fx",
		"dojox/fx",
		"dijit/registry",
		"dijit/layout/ContentPane",
		"dijit/TitlePane",
		"dijit/layout/AccordionContainer",
		"dojox/widget/TitleGroup",
		"dijit/form/HorizontalSlider",
		"dijit/form/HorizontalRuleLabels",
		"esri/layers/ArcGISDynamicMapServiceLayer",
		"esri/layers/FeatureLayer",
		"esri/layers/GraphicsLayer",
		"esri/graphic",
		"esri/tasks/query",
		"esri/tasks/QueryTask",
		"esri/geometry/Extent",
		"dojo/NodeList-traverse"
		], 


	function (declare,
			d3,
			_, 
			JSON,
			parser,
			on,
			aspect,
			array,
			html,
			win,			
			query,
			dom,
			domClass,
			domStyle,
			domAttr,
			domConstruct,
			domGeom,
			fx,
			coreFx,
			xFx,
			registry,
			ContentPane,
			TitlePane,
			AccordionContainer,
			TitleGroup,
			HorizontalSlider,
			HorizontalRuleLabels,
			DynamicMapServiceLayer,
			FeatureLayer,
			GraphicsLayer,
			Graphic,
			Query,
			QueryTask,
			Extent
		  ) 
		
		{

		var tool = function(plugin, appData, appConfig){
			var self = this;
			this._plugin = plugin;
			this._app = this._plugin.app;
			this._container = this._plugin.container;
			this._plugin_directory = this._plugin.plugin_directory;
			this._legend = this._plugin.legendContainer;
			this._map = this._plugin.map;
			this._mapLayers = {};
			this._mapLayer = {};
			this._featureLayer = {};
			this._mapLayers_closeState = {};
			this._extent = {
				"xmin": 0,
				"ymin": 0,
				"xmax": 0,
				"ymax": 0,
				"spatialReference": {
					"wkid": 102100,
					"latestWkid": 3857
				}
			};
			this._data = JSON.parse(appData);
			this._interface = JSON.parse(appConfig);
			this._firstLoad = this._plugin._firstLoad;
			this._defaultLabels = {
				
			}
			this._defaultTitles = {
				
			}
			this.totals = {}

			this.initialize = function(){
				//console.log("initialize - container");
				
				this._extent.xmin = _.min(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.xmin; }));
				this._extent.ymin = _.min(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.ymin; }));
				this._extent.xmax = _.max(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.xmax; }));
				this._extent.ymax = _.max(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.ymax; }));
				
				domStyle.set(this._container, {
					"padding": "0px"
				});
				
				var node = _.first(query("#" + this._container.parentNode.id + " .sidebar-nav"));
				this.infoGraphicButton = domConstruct.create("button", {
					class: "button button-default plugin-ls info-graphic",
					style: "display:none",
					innerHTML: '<img src="' + this._plugin_directory + '/InfographicIcon_v1_23x23.png" alt="show overview graphic">'
				}, node, "first")
				
				if (_.has(this._interface, "infoGraphic")) {
					domAttr.set(this.infoGraphicButton, "data-popup", JSON.stringify(this._interface.infoGraphic.popup));
					domAttr.set(this.infoGraphicButton, "data-url", this._interface.infoGraphic.url);
					
					var display = (this._interface.infoGraphic.show) ? "block" : "none";
					domStyle.set(this.infoGraphicButton, "display", display);
				}
				
				/* on(this.infoGraphicButton, "mouseover", function(){
					self.showMessageDialog(this, "Learn more");
				})
				
				on(this.infoGraphicButton, "mouseout", function(){
					self.hideMessageDialog();
				}) */
				
				var plugin = this;
				on(this.infoGraphicButton, "click", function(c){
					var popup = JSON.parse(domAttr.get(this, "data-popup"));
					var url = domAttr.get(this, "data-url");
					if (popup) {
						var html = url.replace("PLUGIN-DIRECTORY", plugin._plugin_directory);
						TINY.box.show({
							animate: true,
							html: html,
							fixed: true,
							width: 640,
							height: 450
						});
					} else {
						window.open(url, "_blank");
					}
					
				})
				
				var loadingDiv = domConstruct.create("div", {
					innerHTML:"<i class='fa fa-spinner fa-spin fa-3x fa-fw'></i>",
					style:"position:absolute; left: 110px; top:50%; width:100px; height:100px; line-height:100px; text-align:center;"
				}, this._container);
				
				this.loadLayers();
				this.loadLayerStats();
				this.loadInterface(this);
			}
			
			this.showTool = function(){
				if (this._region != "") {
					this.updateInterface();
					this.updateExtentByRegion(this._region);
					this.setMapLayers();
				}
			} 

			this.hideTool = function(){
				
			}
			
			this.closeTool = function(){
				if (!_.isEmpty(this._mapLayers)) {
					array.forEach(_.keys(this._mapLayers), function(region) {
						self._mapLayers_closeState[region] = {};
						array.forEach(_.keys(self._mapLayers[region]), function(layer) {
							self._mapLayers_closeState[region][layer] = self._mapLayers[region][layer].visible;
							self._mapLayers[region][layer].hide();
						})
					})
				}
			}
			
			this.loadLayerStats = function() {
				array.forEach(_.keys(this._interface.region), function(key) {
					self.totals[key] = {};
					self.totals[key].habitat = {};
					self.totals[key].factors = {};
					
					var q = new Query();
					q.where = "1=1";
					q.returnGeometry = false;
					q.outFields = self._interface.region[key].query.habitat.outFields;
					
					var qt = new QueryTask(self._interface.region[key].query.habitat.url);
					qt.execute(q, function(results) {
						var habitat = self._interface.region[key].query.habitat.key;
						var keyField = self._interface.region[key].query.habitat.keyField;
						var valueField = self._interface.region[key].query.habitat.valueField;
						
						array.forEach(results.features, function(row) {
							self.totals[key].habitat[habitat[row.attributes[keyField]]] = row.attributes[valueField];
						});
						self.totals[key].habitat.total = _.reduce(_.values(self.totals[key].habitat), function(memo, num) { return memo + num }, 0)
						
						
						array.forEach(_.keys(self._interface.region[key].query.factors), function(factor) {
							self.totals[key].factors[factor] = {}
							
							var q = new Query();
							q.where = "1=1";
							q.returnGeometry = false;
							q.outFields = self._interface.region[key].query.factors[factor].outFields;
							
							var qt = new QueryTask(self._interface.region[key].query.factors[factor].url);
							qt.execute(q, function(results) {
								var keyField = self._interface.region[key].query.factors[factor].keyField;
								var valueField = self._interface.region[key].query.factors[factor].valueField;
								
								var total = _.reduce(_.map(results.features, function(row) { return row.attributes[valueField]; }) , function(memo, num) { return memo + num }, 0)
								array.forEach(results.features, function(row) {
									self.totals[key].factors[factor][row.attributes[keyField]] = row.attributes[valueField] / total * self.totals[key].habitat.total;
								});
							});
						});
					});
				});
			}

			this.loadLayers = function() {
				var i = 0
				array.forEach(_.keys(self._interface.region), function(region){
					self._mapLayers[region] = {}
					array.forEach(_.keys(self._interface.region[region].layers), function(layer) {
						var id = "ls-layer-" + i;
						if (self._interface.region[region].layers[layer].type == "dynamic") {
							var mapLayer = new DynamicMapServiceLayer(self._interface.region[region].layers[layer].url, { id:id });
							mapLayer.setVisibleLayers(self._interface.region[region].layers[layer].visibleIds);
							mapLayer.setImageFormat("png32");
						} else {
							var mapLayer = new FeatureLayer(self._interface.region[region].layers[layer].url, { id:id, outFields:["*"] });
							
							on(mapLayer, "click", function(evt){
								self._map.graphics.clear()
								var symbol = new esri.symbol.SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([0,0,0,1]),4), new dojo.Color([0,0,0,0]));
								self._map.graphics.add(new Graphic(evt.graphic.geometry, symbol))
								
								var node = _.first(query(".plugin-ls .details"));
								var params = {
									node: node,
									duration: 800,
									beforeBegin: function(){
										domStyle.set(node, "display", "block")
									}
								};
								fx.fadeIn(params).play();
								
								var attributes = evt.graphic.attributes;
								var data = {};
								data.habitat = self._interface.region[self._region].query.habitat.key[attributes["INDEX"]];
								data.final = attributes[self._interface.chart.fields.final];
								
								data.data = array.map(_.keys(self._interface.chart.fields.factors), function(key) {
									return { "name": key, "value": attributes[self._interface.chart.fields.factors[key]] }
								})
								
								self.updateDetailChart(data);
							})
							
							/* on(mapLayer, "mouse-over", function(evt){
								var symbol = new esri.symbol.SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([0,0,0,1]),2), new dojo.Color([0,0,0,0.1]));
								self.hoverLayer.add(new Graphic(evt.graphic.geometry, symbol))
							})
							
							on(mapLayer, "mouse-out", function(evt){
								self.hoverLayer.clear();
							}) */
						}
						if (mapLayer) {
							self._mapLayers[region][layer] = mapLayer;
							self._map.addLayer(mapLayer);
							mapLayer.hide();
						}
						i += 1
					});
				});
				
				/* this.hoverLayer = new GraphicsLayer();
				this._map.addLayer(this.hoverLayer); */
				
				on(this._map, "click", function(evt){
					
					if(!_.contains(evt.target.parentElement.id.split("-"), "ls")) {
						self._map.graphics.clear();
						var node = _.first(query(".plugin-ls .details"));
						var params = {
							node: node,
							duration: 500,
							onEnd: function(){
								domStyle.set(node, "display", "none")
							}
						};
						fx.fadeOut(params).play();
					}
				})
			}
			
			this.createDetailChart = function() {
				this.chart = {};
				this.chart.position = this._interface.chart.position;
				var colors = this._interface.chart.colors;
				var domain = this._interface.chart.domain;
				var data = this._interface.chart.data;
				var tickValues = this._interface.chart.tickValues;

				this.chart.x = d3.scale.linear()
					.domain(domain)
					.range([0, self.chart.position.width -  self.chart.position.margin.right]);
					
				var xAxis = d3.svg.axis()
					.scale(self.chart.x)
					.tickValues(tickValues)
					.tickPadding(5)
					.innerTickSize(0)
					.outerTickSize(0)
					.orient("bottom");
				
				this.chart.plot = d3.select(".chart")
					.append("svg")
						.attr("width", self.chart.position.width + self.chart.position.margin.left + self.chart.position.margin.right)
						.attr("height", self.chart.position.height + self.chart.position.margin.top + self.chart.position.margin.bottom)
					.append("g")
						.attr("transform", "translate(" + self.chart.position.margin.left + "," + self.chart.position.margin.top + ")");
				
				this.chart.plot.append("g")
					  .attr("class", "x axis")
					  .attr("transform", "translate(0," + self.chart.position.height + ")")
					  .call(xAxis)
					  .append("text")
						  .attr("y", 12)
						  .attr("x", self.chart.position.width/2)
						  .style("text-anchor", "middle")
						  .text("Factor Score");
				
				this.chart.plot.selectAll("rect")
					.data(data)
					.enter().append("rect")
						.attr("height", 22)
						.attr("width", function(d) { return (d.value == 0) ? (self.chart.x(d.value) + 16) : self.chart.x(d.value); })
						.attr("x", 0)
						.attr("y", function(d,i) { return (i * 25); })
						.attr("fill", function(d) {  return colors.scores[d.value]; })
						.on("mouseover", function(d) {
							domClass.add(_.first(query(".plugin-ls .details .content tr." + d.name)), "bar-on-table")
						})
						.on("mouseout", function(d) {
							domClass.remove(_.first(query(".plugin-ls .details .content tr." + d.name)), "bar-on-table")
						})
									
				this.chart.plot.selectAll("text.bar-labels")
					.data(data)
					.enter().append("text")
						.text(function(d) { return d.value })
							.attr("class", "bar-labels")
							.attr("text-anchor", "end")
							.attr("x", function(d) { return (d.value == 0) ? 12 : self.chart.x(d.value) - 5; })
							.attr("y", function(d, i) { return  (i * 25) + 16 });
							
				this.chart.plot.selectAll("text.bar-axis")
					.data(data)
					.enter().append("text")
						.text(function(d) { return d.axis; })
							.attr("class", "bar-axis")
							.attr("text-anchor", "end")
							.attr("x", -5 )
							.attr("y", function(d, i) { return  (i * 25) + 16 });
			}
			
			this.updateDetailChart = function(data) {
				var colors = this._interface.chart.colors;
				var labels = this._interface.chart.labels;
				
				this.chart.plot.selectAll('rect')
					.data(data.data)
					.transition()
					.duration(500)
						.attr("width", function(d) {   return (d.value == 0) ? (self.chart.x(d.value) + 16) : self.chart.x(d.value);  })
						.attr("fill", function(d) {  return colors.scores[d.value]; })
						
				this.chart.plot.selectAll('text.bar-labels')
					.data(data.data)
					.transition()
					.duration(500)
						.text(function(d) { return d.value })
							.attr("x", function(d) { return (d.value == 0) ? 12 : self.chart.x(d.value) - 5 })
							.attr("y", function(d, i) { return  (i * 25) + 16 });
						
				_.first(query(".plugin-ls .details .content td.category")).innerHTML = labels.habitat[data.habitat];
				_.first(query(".plugin-ls .details .content td.final-score")).innerHTML = data.final;
				query(".plugin-ls .details .content tr.final-rec").style("color", colors.habitat[data.habitat]);
				
				
				array.forEach(data.data, function(d) {
					_.first(query(".plugin-ls .details .content tr." + d.name + " td.label")).innerHTML = labels.factors[d.name];
					_.first(query(".plugin-ls .details .content tr." + d.name + " td.value")).innerHTML = labels.scores[d.value][d.name];
					_.first(query(".plugin-ls .details .content tr." + d.name + " td.score")).innerHTML = d.value;
				})
			}
			
			this.updateMapLayers = function() {
				var visibleIds = (this.recommendationPane.open) ? this._interface.region[this._region].layers.main.visibleIds : [];
				
				array.forEach(_.keys(this._interface.controls.radio), function(rb) {
					if (self[rb + "RadioButton"].checked && !self.recommendationPane.open) {
						visibleIds = _.union(visibleIds, self._data.region[self._region][rb]);
					}
				});
				
				array.forEach(_.keys(this._interface.controls.check), function(cb) {
					if (self[cb + "CheckBox"].checked) {
						visibleIds = _.union(visibleIds, self._data.region[self._region][cb]);
					}
				});
				
				this._mapLayer.setVisibleLayers(visibleIds);
			}
			
			this.setMapLayers = function() {
				array.forEach(_.keys(this._mapLayers), function(key) {
					if (key == self._region) {
						self._mapLayers[key].main.setVisibleLayers(self._interface.region[key].layers.main.visibleIds);
						self._mapLayers[key].main.show();
						self._mapLayers[key].feature.show();
						
						self._mapLayer = self._mapLayers[key].main;
						self._featureLayer = self._mapLayers[key].feature;
					} else {
						self._mapLayers[key].main.hide();
						self._mapLayers[key].feature.hide();
					}
				});
			}
			
			this.setDefinitionExpression = function(pane, value, type) {
				var layerDefs = (!_.isUndefined(this._mapLayer.layerDefinition)) ? this._mapLayer.layerDefinition : [];
				switch(pane) {
					case "habitat":
						var def = this._interface.region[this._region].definitionExpression.habitat.field + " = " + value;
						var index = this._interface.region[this._region].definitionExpression.habitat.dynamicId;
						this._featureLayer.setDefinitionExpression(def);
						break;
						
					case "factor":
						var def = this._interface.region[this._region].definitionExpression.factor[type].field + " = " + value;
						var index = this._interface.region[this._region].definitionExpression.factor[type].dynamicId;
						break;
				}
				layerDefs[index] = def;
				this._mapLayer.setLayerDefinitions(layerDefs)
			}
			
			this.clearDefinitionExpression = function(pane, type) {
				var layerDefs = (!_.isUndefined(this._mapLayer.layerDefinition)) ? this._mapLayer.layerDefinition : [];
				switch(pane) {
					case "habitat":
						var index = this._interface.region[this._region].definitionExpression.habitat.dynamicId;
						this._featureLayer.setDefinitionExpression("");
						break;
						
					case "factor":
						var index = this._interface.region[this._region].definitionExpression.factor[type].dynamicId;
						break;
				}
				layerDefs[index] = null;
				this._mapLayer.setLayerDefinitions(layerDefs); 
			}
			
			this.updateExtentByRegion = function(region) {
				this._map.setExtent(new Extent(this._interface.region[region].extent), false)
			}
						
			this.loadInterface = function() {
				var self = this;
				domStyle.set(this._container, { 
					"overflow": "visible"
				});
				
				//empty layout containers
			    this._containerPane = new ContentPane({
					id: "plugin-ls-" + self._map.id,
					style: "position:relative; overflow: visible; width:100%; height:100%;",
					className: 'cr-dojo-dijits'
			    });
			    this._containerPane.startup();
				this._container.appendChild(this._containerPane.domNode);
				
				this.createInputs();
				this.createDetailChart();
				
				this.tip = domConstruct.create("div", { className: "plugin-ls help", tabindex: -1 });
				domConstruct.create("div", {
					class: "header",
					innerHTML: "Documentation"
				},  this.tip);
				
				var closeDiv = domConstruct.create("div", {
					class: "icon-cancel close"
				},  this.tip);
				
				on(closeDiv, "click", function(evt) {
					var node = this.parentNode;
					var params = {
						node: node,
						duration: 500,
						onEnd: function(){
							domStyle.set(node, "display", "none");
						}
					};
					fx.fadeOut(params).play();
				})
				domConstruct.create("div", {
					class: "inner",
				},  this.tip);
				
				
				this._container.appendChild(this.tip);
				
				this.createTooltips();
				domStyle.set(_.first(query(".plugin-ls .fa-spinner")).parentNode, "display", "none");
			}
			
			this.createInputs = function(){
				this.inputsPane = new ContentPane({});
				this._containerPane.domNode.appendChild(this.inputsPane.domNode);
			    domStyle.set(this.inputsPane.containerNode, {
					"position": "relative",
					"overflow": "visible",
					"background": "none",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding": "20px 0px 0px 20px"
				});
				on(this._map, "resize", function() {
					domStyle.set(self.inputsPane.containerNode, { "width": "100%", "height": "auto" });
				});
				
				var table = domConstruct.create("table", { style:"position:relative;width: 100%;background: none;border: none; margin:0px 0px 0px 0px;"}, this.inputsPane.containerNode);
				var tr = domConstruct.create("tr", {}, table);
				var regionTd = domConstruct.create("td", { "colspan":3, "style": "padding-bottom:10px;" }, tr);
				
				var regionText = domConstruct.create("div", {
					style:"position:relative;margin-bottom:5px;text-align:left;font-size:14px;",
					innerHTML: "<i class='fa fa-question-circle ls-" + this._map.id + "-region'></i>&nbsp;<b>Select a County:</b>"
				}, regionTd);
				
				var regionSelectDiv = domConstruct.create("div", { 
					className: "styled-select",
					style:"width:175px;display:inline-block;" 
				}, regionTd);
				this.regionSelect = dojo.create("select", { name: "regionType"}, regionSelectDiv);
				array.forEach(_.keys(this._interface.region), function(key) {
					domConstruct.create("option", { innerHTML: key, value: key }, self.regionSelect);
				});
				on(this.regionSelect, "change", function() {
					self._region = this.value;
					self.updateInterface();
					self.updateExtentByRegion(self._region);
					self.setMapLayers();
				});
				this.regionSelect.value = _.first(this.regionSelect.options).value;
				this._region = this.regionSelect.value;
				
				this.downloadReport = domConstruct.create("div", { className:"downloadButton ls-report", innerHTML:'<i class="fa fa-file-pdf-o downloadIcon"></i><span class="downloadText">County Summary</span>' }, regionTd);
				on(this.downloadReport,"mouseover", function(){
					if (self._region && self._region != "") {
						domStyle.set(this, "background", "#0096d6");
					}
				});
				on(this.downloadReport,"mouseout", function(){
					if (self._region && self._region != "") {
						 domStyle.set(this, "background", "#2B2E3B");
					}
				});
				on(this.downloadReport,"click", function(){
					 if (self._region && self._region != "") {
						var url = self._interface.region[self._region].download.report;
						url = url.replace("HOSTNAME-", window.location.href);
						window.open(url, "_blank");
					 }
				});
				
				this.layersPane = new ContentPane({ class: "layers"});
				this._containerPane.domNode.appendChild(this.layersPane.domNode);
				domStyle.set(this.layersPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding": "0px",
					"margin-top":"5px"
				});
				this.titleGroupPane = new TitleGroup({style:"height:auto;"});
				
				this.recommendationPane = new TitlePane({
					title: "<i class='fa fa-caret-right tg-toggle-icon'></i>&nbsp;Living Shoreline (<span class='total'></span> total miles)",
					style:"width:100%;",
					open:true
				});
				aspect.after(this.recommendationPane, "toggle", function(){
					if (this.open) {
						domClass.remove(this.titleNode.firstChild, "fa-caret-right");
						domClass.add(this.titleNode.firstChild, "fa-caret-down");
						self._featureLayer.show();
					} else {
						domClass.remove(this.titleNode.firstChild, "fa-caret-down");
						domClass.add(this.titleNode.firstChild, "fa-caret-right");
						self._featureLayer.hide();
					}
					self.updateMapLayers();
				})
				
				dojo.mixin(this.recommendationPane, {
					_onTitleClick: function(){
						var widget = this;
						if (!widget.open) {
							query(".layers .dijitTitlePane").forEach(function (b) {
								var b = dijit.getEnclosingWidget(b);
								if (b.open || b.id == widget.id) {
									b.toggle();
								}
							})
						}
					}
				});
				this.titleGroupPane.addChild(this.recommendationPane)
				
				this.statsControlPane = new ContentPane({ class: "stats recommendations"});
				this.recommendationPane.containerNode.appendChild(this.statsControlPane.domNode);
				domStyle.set(this.statsControlPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding-top": "5px"
				});
				
				array.forEach(_.keys(this._interface.controls.habitat), function(habitat, i) {
					var statDiv = domConstruct.create("div", { class: "stat"}, self.statsControlPane.containerNode);
					var stat = domConstruct.create("div", { class: "stat-pill " + habitat}, statDiv);
					domAttr.set(stat, "data-expression-value", self._interface.controls.habitat[habitat].value);
					var number = domConstruct.create("div", { class: "stat-number" }, stat);
					domConstruct.create("div", { class: "stat-value", innerHTML: 0 }, number);
					domConstruct.create("div", { class: "stat-units", innerHTML: "miles"}, number);
					domConstruct.create("div", { class: "stat-label", innerHTML: self._interface.controls.habitat[habitat].label }, stat);
					domConstruct.create("div", { class: "stat-info", innerHTML:"<i class='fa fa-question-circle ls-" + self._map.id + "-stat-" + habitat + "'></i>"}, statDiv);
					var statClose = domConstruct.create("div", { class: "stat-close icon-cancel close"}, statDiv);
					
					on(statClose, "click", function(evt){
						query(".plugin-ls .recommendations .stat-pill").removeClass("inactive");
						query(".stat-close", this.parentNode).style("display", "none");
						
						var node = _.first(query(".stat-pill", this.parentNode));
						var value = domAttr.get(node, "data-expression-value");
						self.clearDefinitionExpression("habitat");
					})
					
					on(stat, "mouseover", function(){
						domClass.add(this, "stat-over");
					})
					on(stat, "mouseout", function(){
						domClass.remove(this, "stat-over");
					})
					on(stat, "click", function(){
						query(".plugin-ls .recommendations .stat-pill").addClass("inactive");
						domClass.remove(this, "inactive");
						query(".recommendations .stat-close").style("display", "none");
						query(".stat-close", this.parentNode).style("display", "block");
						
						var value = domAttr.get(this, "data-expression-value");
						self.setDefinitionExpression("habitat", value);
					})
					
				});
				
				domConstruct.create("div", { 
					style:"line-height:14px;text-align:left;cursor:pointer;margin:15px 0px 10px 0px;font-size:12px;padding-left:30px;color:#777777;",
					innerHTML: '-- zoom into map to select a shoreline segment for more details --'
				},  self.statsControlPane.containerNode);
				
				var detailDiv = domConstruct.create("div", {
					class: "details"
				},  self.statsControlPane.containerNode);
				
				domConstruct.create("div", {
					class: "header",
					innerHTML: "Details of Shoreline Recommendation"
				},  detailDiv);
				
				var closeDiv = domConstruct.create("div", {
					class: "icon-cancel close"
				},  detailDiv);
				
				on(closeDiv, "click", function(evt) {
					var node = this.parentNode;
					var params = {
						node: node,
						duration: 500,
						onBegin: function() {
							self._map.graphics.clear();
						},
						onEnd: function(){
							domStyle.set(node, "display", "none");
						}
					};
					fx.fadeOut(params).play();
				})
				
				var detailInner = domConstruct.create("div", {
					class: "inner",
				},  detailDiv);
				
				domConstruct.create("div", {
					class: "chart"
				},  detailInner);
				
				var content = domConstruct.create("div", {
					class: "content"
				},  detailInner);
				
				var table = domConstruct.create("table", {}, content);
				array.forEach(_.keys(this._interface.chart.labels.factors), function(key) {
					var tr = domConstruct.create("tr", { class:key }, table);
					domConstruct.create("td", {class:"label"}, tr);
					domConstruct.create("td", {class:"value"}, tr);
					domConstruct.create("td", {class:"score"}, tr);
				})
				
				var tr = domConstruct.create("tr", { class:"final-rec" }, table);
				domConstruct.create("td", {class:"category", colspan:2}, tr);
				domConstruct.create("td", {class:"final-score"}, tr);
				
				this.factorPane = new TitlePane({
					title: "<i class='fa fa-caret-right tg-toggle-icon'></i>&nbsp;Living Shoreline Factors",
					style:"width:100%;",
					open:false
				});
				aspect.after(this.factorPane, "toggle", function(){
					if (this.open) {
						domClass.remove(this.titleNode.firstChild, "fa-caret-right");
						domClass.add(this.titleNode.firstChild, "fa-caret-down");
						self.updateFactors();
					} else {
						domClass.remove(this.titleNode.firstChild, "fa-caret-down");
						domClass.add(this.titleNode.firstChild, "fa-caret-right");
					}
					self.updateMapLayers();
				})
				
				dojo.mixin(this.factorPane, {
					_onTitleClick: function(){
						var widget = this;
						if (!widget.open) {
							query(".layers .dijitTitlePane").forEach(function (b) {
								var b = dijit.getEnclosingWidget(b);
								if (b.open || b.id == widget.id) {
									b.toggle();
								}
							})
						}
					}
				});
				this.titleGroupPane.addChild(this.factorPane);
				
				this.factorControlPane = new ContentPane({ class: "stats factors"});
				this.factorPane.containerNode.appendChild(this.factorControlPane.domNode);
				domStyle.set(this.factorControlPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding-top": "5px"
				});
				
				array.forEach(_.keys(this._interface.controls.factors).reverse(), function(factor, i) {
					var factorsDiv = domConstruct.create("div", { class: "stat"}, self.factorControlPane.containerNode);
					var stat = domConstruct.create("div", { class: "stat-pill factor-" + factor}, factorsDiv);
					domAttr.set(stat, "data-expression-value", factor);
					var number = domConstruct.create("div", { class: "stat-number" }, stat);
					domConstruct.create("div", { class: "stat-value", innerHTML: factor }, number);
					domConstruct.create("div", { class: "stat-units", innerHTML: "miles"}, number);
					domConstruct.create("div", { class: "stat-label " + factor, innerHTML:"" }, stat);
					domConstruct.create("div", { class: "stat-score", innerHTML: factor }, stat);
					domConstruct.create("div", { class: "stat-info", innerHTML:"<i class='fa fa-question-circle ls-" + self._map.id + "-stat-factor_" + factor + "'></i>"}, factorsDiv);
					
					var factorClose = domConstruct.create("div", { class: "stat-close icon-cancel close"}, factorsDiv);
					on(factorClose, "click", function(evt){
						query(".plugin-ls .factors .stat-pill").removeClass("inactive");
						query(".stat-close", this.parentNode).style("display", "none");
						
						var type = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
						self.clearDefinitionExpression("factor", type);
					})
					
					on(stat, "mouseover", function(){
						domClass.add(this, "stat-over");
					})
					on(stat, "mouseout", function(){
						domClass.remove(this, "stat-over");
					})
					on(stat, "click", function(){
						query(".plugin-ls .factors .stat-pill").addClass("inactive");
						domClass.remove(this, "inactive");
						query(".factors .stat-close").style("display", "none");
						query(".stat-close", this.parentNode).style("display", "block");
						
						var value = domAttr.get(this, "data-expression-value");
						var type = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
						self.setDefinitionExpression("factor", value, type);
					})
				});
				
				var cp = new ContentPane({}, this.factorPane.containerNode);
				var rbDiv = domConstruct.create("div", { style:"margin-bottom:20px;height:auto"}, cp.containerNode);
				array.forEach(_.keys(this._interface.controls.radio), function(rb) {
					var div = domConstruct.create("div",{ style:"position:relative;margin-bottom:5px;"}, rbDiv);
					var rb = self._interface.controls.radio[rb];
					var radioButtonLabel = domConstruct.create("label", { 
						className:"styled-radio",
						style:"margin:0px 0px 0px 25px;", 
						for: "plugin-ls-" + rb.name + "-" + self._map.id
						}, div);
					
					self[rb.name + "RadioButton"] = domConstruct.create("input", { 
						type: "radio", 
						value: rb.value, 
						name: rb.group, 
						id: "plugin-ls-" + rb.name + "-" + self._map.id
					}, radioButtonLabel);
					
					if (rb.checked) { self[rb.name + "RadioButton"].checked = true }
					
					domConstruct.create("span", {
						innerHTML:rb.label 
					}, radioButtonLabel );
					
					on(self[rb.name + "RadioButton"] , "change", function() {
						self.updateFactors();
						
						array.forEach(_.keys(self._interface.region[self._region].query.factors), function(key) {
							window.setTimeout(function(){ 
								self.clearDefinitionExpression("factor", key);
							}, 500)
						});
						query(".plugin-ls .factors .stat-pill").removeClass("inactive");
						query(".plugin-ls .factors .stat-close").style("display", "none");
						
						self.updateMapLayers();
						
						
					});
					
					domConstruct.create("div", {
						style:"position:absolute;top:4px;left:380px;",
						innerHTML: "<i class='fa fa-question-circle ls-" + self._map.id + "-" + rb.name + "'></i>"
					}, div);
				})
				
				this.layersPane.addChild(this.titleGroupPane);
				this.titleGroupPane.startup();
				
				var cp = new ContentPane({ style:"width:100%;margin-top:10px;position: relative;" });
				this._containerPane.domNode.appendChild(cp.domNode);
				
				domConstruct.create("div", { class:"add-layers-header", innerHTML: "Additional Layers" }, cp.containerNode);
				domConstruct.create("div", { class:"add-layers-instructions", innerHTML: "Learn more about data used as part of these recommendations by selecting from the additional layers below:" }, cp.containerNode);
				
				var checkBoxDiv = domConstruct.create("div", {}, cp.containerNode);
				array.forEach(_.keys(this._interface.controls.check), function(cb) {
					var cb = self._interface.controls.check[cb];
					var checkBoxLabel = domConstruct.create("label", { 
						for: "plugin-ls-" + cb.name + "-" + self._map.id,
						className:"styled-checkbox",
						style:"display:block;margin-left:20px;"
					}, checkBoxDiv);
					
					self[cb.name + "CheckBox"] = domConstruct.create("input", {
						type:"checkbox",
						value:cb.value,
						name:cb.name,
						id:"plugin-ls-" + cb.name + "-" + self._map.id,
						disabled:false,
						checked:false
					}, checkBoxLabel);
					
					domConstruct.create("div", {
						innerHTML: '<span>' + cb.label +'</span>'
					}, checkBoxLabel);
					
					on(self[cb.name + "CheckBox"], "change", function(){
						self.updateMapLayers();
					});
				});
				
				/* var cp = new ContentPane({ style:"width:100%;margin-top:0px;" });
				this._containerPane.domNode.appendChild(cp.domNode); */
				
				var opacity = domConstruct.create("div", {
					className: "utility-control",
					innerHTML: '<span class="slr-' + this._map.id + '-opacity"><b>Opacity</b>&nbsp;<i class="fa fa-adjust"></i></span>'
				}, cp.containerNode);
				
				on(opacity,"click", function() {
					var status = domStyle.get(self.opacityContainer, "display");
					var display = (status == "none") ? "block" : "none";
					domStyle.set(self.opacityContainer, "display", display);
				})
				
				this.opacityContainer = domConstruct.create("div", {
					className: "utility"
				}, cp.containerNode);
				
				//opacity slider
				this.opacitySlider = new HorizontalSlider({
			        name: "opacitySlider",
			        value: 1,
			        minimum: 0,
			        maximum: 1,
			        intermediateChanges: true,
			        showButtons: false,
					disabled: false,
			        style: "width:75px; display:inline-block; margin:0px; background:none;",
			        onChange: function(value){
						array.forEach(_.keys(self._mapLayers), function(region){
							array.forEach(_.keys(self._mapLayers[region]), function(layer){
								self._mapLayers[region][layer].setOpacity(Math.abs(value));
							})
						})
			        }
			    });
				this.opacityContainer.appendChild(this.opacitySlider.domNode);
				
				
			}
			
			this.updateFactors = function() {
				var value = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
				var nodes = query('.plugin-ls .stat-pill[class*="factor-"] .stat-label');
				
				array.forEach(nodes, function(node) {
					var score = domAttr.get(node.parentNode, "data-expression-value");
					if (!_.isUndefined(self._interface.controls.factors[score].label[value])) { 
						var num =  self.totals[self._region].factors[value][score];
						_.first(query(".stat-pill.factor-" + score + " .stat-value")).innerHTML = (num < 10) ? d3.format(".2f")(num) : d3.format(",.0f")(num);
						node.innerHTML = self._interface.controls.factors[score].label[value];
						domStyle.set(node.parentNode.parentNode, "display", "block");
					} else {
						domStyle.set(node.parentNode.parentNode, "display", "none");
					}
				})
			}
			
			this.updateInterface = function(){
				array.forEach(_.keys(this._interface.controls.habitat), function(habitat) {
					var num = self.totals[self._region].habitat[habitat];
					_.first(query(".stat-pill." + habitat + " .stat-value")).innerHTML = (num < 10) ? d3.format(".2f")(num) : d3.format(",.0f")(num);
				});
				_.first(query(".plugin-ls .dijitTitlePaneTitle span.total")).innerHTML = d3.format(",.0f")(self.totals[self._region].habitat.total);
				
				if (!this.recommendationPane.open) {
					this.recommendationPane.toggle();
					this.factorPane.toggle();
				}
				
				this[_.first(_.keys(this._interface.controls.radio)) + "RadioButton"].checked = true;
				array.forEach(_.keys(this._interface.controls.check), function(key) {
					self[key + "CheckBox"].checked = false;
				})
				
				if (!_.isUndefined(this._featureLayer) && !_.isEmpty(this._featureLayer)) {
					this.clearDefinitionExpression("habitat");
					array.forEach(_.keys(this._interface.region[this._region].query.factors), function(key) {
						window.setTimeout(function(){ 
							self.clearDefinitionExpression("factor", key);
						}, 500)
					});
				}
				
				query(".plugin-ls .stat-pill").removeClass("inactive");
				query(".plugin-ls .stat-close").style("display", "none");
				
				var node = _.first(query(".plugin-ls .details"));
				if (domStyle.get(node, "display") == "block") {
					var params = {
						node: node,
						duration: 500,
						onBegin: function() {
							self._map.graphics.clear();
						},
						onEnd: function(){
							domStyle.set(node, "display", "none");
						}
					};
					fx.fadeOut(params).play();
				}
			}
			
			this.updateControls = function() {
				
			}
			
			this.resetInterface = function(){
				
			}

			this.createTooltips = function() {
				on(query('*.fa[class*="ls-' + this._map.id + '"]'), "click", function(evt) {
					self.showMessageDialog(this,"Place holder for documentation explaining different interface components.  No help documentation has been provided on this control but will be populated once received.")
					/* var cssClass = _.last(domAttr.get(this, "class").split(" "));
					var control = _.last(cssClass.split("-"));
					var tooltips = (self._interface.region[self._region] && _.has(self._interface.region[self._region], "tooltips")) ? self._interface.region[self._region].tooltips : self._interface.tooltips;
					var message = tooltips[control];
					if (!_.isUndefined(message)) {
						self.showMessageDialog(this, message);
					} */
				});
			}

			this.showMessageDialog = function(node, message, position) {
				_.first(query(".inner", this.tip)).innerHTML = message;
				var top = domGeom.getMarginBox(this.layersPane.domNode).t;
				var height = domGeom.position(this.layersPane.domNode).h;
				domStyle.set(self.tip, {
					"top": top + "px",
					"height": height + "px"
				});
				var node = _.first(query(".plugin-ls .help"));
				var params = {
					node: node,
					duration: 800,
					beforeBegin: function(){
						domStyle.set(node, "display", "block")
					}
				};
				fx.fadeIn(params).play();
            }

            this.hideMessageDialog = function() {
        		var node = _.first(query(".plugin-ls .help"));
				var params = {
					node: node,
					duration: 800,
					onEnd: function(){
						domStyle.set(node, "display", "none")
					}
				};
				fx.fadeOut(params).play();
			}


		};
		
		return tool;	
		
	}

);
