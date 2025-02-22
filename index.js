/*
 * (C) Copyright 2016 Ventrom LLC (http://www.ventrom.com/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Contributors:
 *     David Ciarletta
 *     Renan Dembogurski
 */

'use strict'

const d3 = require('d3')
const inflector = require('inflected')
const pluck = require('pluck')
const reductio = require('reductio')

function pluckWithDefault(spec, defaultValue) {
    let plucker = pluck(spec)
    return function(o) {
        return plucker(o) || defaultValue
    }
}

function pluckFullLoc(rec) {
    return rec["location"] ? Object.keys(rec["location"])
        .filter(function(k) {return typeof(rec["location"][k]) === "string"})
        .sort().map(function(k) {return k + "-" + rec["location"][k]}).join("-")
        : "NA"
}

function pluckLatLon(rec) {
    if (! rec["location"]) return null
    let lockeys = Object.keys(rec["location"])
    let latnames = ["lat", "latitude", "lt", "ltd"]
    let lonnames = ["lon", "long", "longitude", "lng", "ln"]
    let lat = null, lon = null
    for (let key of lockeys) {
        if (typeof(rec["location"][key]) !== "number") continue
        let lkey = key.toLowerCase()
        if (latnames.find((n) => {return lkey === n}))
            lat = key
        if (lonnames.find((n) => {return lkey === n}))
            lon = key
    }
    return (lat !== null && lon !== null) ? {"lat": rec["location"][lat], "lon": rec["location"][lon]} : null
}

function pluckMetric(name) {
    return function(r) {
        for (let m of r.metrics) {
            if (m.name === name) return m.canonicalized.value
        }
        return null
    }
}

function generateReducer(id, accessor, filter) {
    let full_filter = function(r) {return (accessor(r) !== null) ? true : false}
    if (filter) full_filter = function(r) {return (accessor(r) !== null) ? filter(r) : false}
    let reducer = reductio()
    reducer.value(id)
        .filter(full_filter)
        .sum(accessor)
        .valueList(accessor)
        .count(true).min(true).max(true).avg(true).median(true)
    return reducer
}

function generateGroupAccessors(id) {
    return {
        "sum": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".sum")(d) },
        "average": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".avg")(d) },
        "count": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".count")(d) },
        "min": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".min")(d) },
        "max": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".max")(d) },
        "median": function(d) { return (typeof(d.value) === "number") ? d.value : pluck("value."+id+".median")(d) },
        "values": function(d) { return Array.isArray(d.value) ? d.value : pluck("value."+id+".valueList")(d) }
    }
}

function recommendFilters(dataset) {
    let result = []

    Object.keys(dataset.dimensions).forEach((tag) => {
        let d = dataset.dimensions[tag]
        if (d.dim === "time" || d.items.size <= 1) return
        let type = ""
        let dga = "sum"
        let dtitle = inflector.titleize(d.key)
        if (tag === "position") {
            type = "geo"
            dtitle = "Location"
        } else {
            type = d.items.size > 9 ? "row" : "pie"
        }
        d.metrics.forEach((m) => result.push(
            {"type": type,
             "dimension": d,
             "groups": [dataset.groups[m]],
             "defaultGroupAccessor": dga,
             "title": dataset.groups[m].title + " by " + dtitle}))
    })

    return result
}

function recommendCharts(dataset) {
    let result = []
    let timeUnits = "year"

    if (dataset.timeRange[1] !== 0) {
        let secDiff = (dataset.timeRange[1] - dataset.timeRange[0])/1000
        if (secDiff < 3600*12) { // up to 12 hours
            timeUnits = null
        } else if (secDiff < 3600*24*7) { // up to 7 days
            timeUnits = "hour"
        } else if (secDiff < 3600*24*70) { // up to 10 weeks
            timeUnits = "day"
        } else if (secDiff < 3600*24*365) { // up to a year
            timeUnits = "week"
        } else if (secDiff < 3600*24*3650) { // up to 10 years
            timeUnits = "month"
        }
    }

    Object.keys(dataset.dimensions).forEach((tag) => {
        let d = dataset.dimensions[tag]

        if (d.dim === "time" && d.key === timeUnits) {
            let compatibleUnitsFound = []
            d.metrics.forEach((m) => {
                result.push({"type": "candle", "dimension": d, "groups": [dataset.groups[m]], "defaultGroupAccessor": "values", "title": dataset.groups[m].title + " by " + inflector.titleize(d.key)})

                if (compatibleUnitsFound.indexOf(dataset.groups[m].units) < 0) {
                    let compatibleMetrics = [...d.metrics].filter((m2) => (m2 !== m && dataset.groups[m].units === dataset.groups[m2].units))
                    if (compatibleMetrics.length > 0) {
                        compatibleUnitsFound.push(dataset.groups[m].units)
                        compatibleMetrics.push(m)
                        let title = compatibleMetrics.map((m) => dataset.groups[m].title).join(", ") + " by " + inflector.titleize(d.key)
                        result.push({"type": "line", "dimension": d, "groups": compatibleMetrics.map((m) => dataset.groups[m]), "defaultGroupAccessor": "average", "title": title})
                    }
                }

                dataset.groups[m].dimensions.forEach((tag2) => {
                    let d2 = dataset.dimensions[tag2]
                    if (d2.dim === "time" || d2.items.size < 2 || typeof([...d2.items][0]) !== "string") return
                    let groups = [...d2.items].map((item) => {
                        let id = inflector.parameterize(item+"-"+m)
                        return {
                            title: dataset.groups[m].title,
                            label: item,
                            units: dataset.groups[m].units,
                            accessor: dataset.groups[m].accessor,
                            dimensions: new Set([...dataset.groups[m].dimensions].filter((t) => dataset.dimensions[t].dim !== d2.dim)),
                            reducer: generateReducer(id, dataset.groups[m].accessor, function(r) { return d2.accessor(r) === item}),
                            groupAccessors: generateGroupAccessors(id),
                            key: id
                        }
                    })
                    let title = dataset.groups[m].title + " by " + inflector.titleize(d.key) + " by " + inflector.titleize(d2.key)
                    result.push({"type": "sand", "dimension": d, "groups": groups, "defaultGroupAccessor": "sum", "title": title})
                })
            })
        }

        if (d.dim === "time" || d.items.size < 2 || d.items.size > 10 || typeof([...d.items][0]) !== "string") return

        // Generate grouped/stacked bar chart recommendations
        d.metrics.forEach((m) => {
            dataset.groups[m].dimensions.forEach((tag2) => {
                let d2 = dataset.dimensions[tag2]
                if (d2.dim === d.dim || d2.dim === "time" || d2.items.size < 2 || typeof([...d2.items][0]) !== "string") return
                let groups = [...d2.items].map((item) => {
                    let id = inflector.parameterize(item+"-"+m)
                    return {
                        title: dataset.groups[m].title,
                        label: item,
                        units: dataset.groups[m].units,
                        accessor: dataset.groups[m].accessor,
                        dimensions: new Set([...dataset.groups[m].dimensions].filter((t) => dataset.dimensions[t].dim !== d2.dim)),
                        reducer: generateReducer(id, dataset.groups[m].accessor, function(r) { return d2.accessor(r) === item}),
                        groupAccessors: generateGroupAccessors(id),
                        key: id
                    }
                })
                let title = dataset.groups[m].title + " by " + inflector.titleize(d.key) + " by " + inflector.titleize(d2.key)
                result.push({"type": "bar", "dimension": d, "groups": groups, "defaultGroupAccessor": "sum", "title": title})
            })
        })
    })

    return result
}

//
// prepare a set of data for use with crossfilter
// by analyzing the available dimensions and metrics
// in the data set.
//
function deduce(data) {
    // this will hold the results
    let result = {
        dimensions: {},
        groups: {},
        locations: {},
        timeRange: [Infinity, 0],
        records: data
    }
    let timeDims = ["year", "month", "week", "day", "hour"]

    // process the information in each record
    data.forEach((rec) => {
        let recDims = []
        let recMetrics = []
        Object.keys(rec).forEach((field) => {
            // Process well-known fields
            switch (field) {
                case "location":
                    let latlon = pluckLatLon(rec)
                    if (latlon) {
                            let fullLoc = pluckFullLoc(rec)
                            result.locations[fullLoc] = latlon
                            if (!result.dimensions["position"]) {
                                result.dimensions["position"] = {
                                    dim: field,
                                    key: "position",
                                    items: new Set(),
                                    accessor: pluckFullLoc,
                                    metrics: new Set()
                                }
                            }
                            result.dimensions["position"].items.add(fullLoc)
                            recDims.push(result.dimensions["position"])
                        }
                case "system":
                case "activity":
                case "organization":
                    Object.keys(rec[field]).forEach((tag) => {
                        if (typeof(rec[field][tag]) !== "string") return
                        if (!result.dimensions[tag]) {
                            result.dimensions[tag] = {
                                dim: field,
                                key: tag,
                                items: new Set(),
                                accessor: pluckWithDefault(field+"."+tag, "NA"),
                                metrics: new Set()
                            }
                        }
                        result.dimensions[tag].items.add(rec[field][tag])
                        recDims.push(result.dimensions[tag])
                    })
                    break;

                case "conditions":
                    // TODO when better examples exist
                    break;
                case "time":
                    // preparse the timestamp into time dimensions
                    rec.dt = new Date(rec.time)
                    rec.year = d3.time.year(rec.dt)
                    rec.month = d3.time.month(rec.dt)
                    rec.week = d3.time.week(rec.dt)
                    rec.day = d3.time.day(rec.dt)
                    // TODO add day of week?
                    rec.hour = d3.time.hour(rec.dt)
                    // TODO will probably want to add minute/second for completeness
                    if (!result.dimensions[timeDims[0]]) {
                        timeDims.forEach((tag) => {
                            result.dimensions[tag] = {
                                dim: "time",
                                key: tag,
                                accessor: pluckWithDefault(tag, new Date(0)),
                                metrics: new Set()
                            }
                        })
                    }
                    // update the overall time extent
                    result.timeRange[0] = Math.min(result.timeRange[0], rec.dt)
                    result.timeRange[1] = Math.max(result.timeRange[1], rec.dt)
                    recDims.push.apply(recDims, timeDims.map((t) => result.dimensions[t]))
                    break;
                case "metrics":
                    rec.metrics.forEach((m) => {
                        var id = inflector.parameterize(m.name)
                        if (!result.groups[id]) {
                            result.groups[id] = {
                                key: id,
                                title: inflector.titleize(m.name),
                                units: m.units,
                                accessor: pluckMetric(m.name),
                                dimensions: new Set(),
                                reducer: generateReducer(id, pluckMetric(m.name)),
                                groupAccessors: generateGroupAccessors(id)
                            }
                        }
                        recMetrics.push(result.groups[id])
                    })
                    break;
                case "rep":
                case "baseline":
                case "produced_by":
                    if (!result.dimensions[field]) {
                        result.dimensions[field] = {
                            dim: "data_source",
                            key: field,
                            items: new Set(),
                            accessor: pluckWithDefault(field, "NA"),
                            metrics: new Set()
                        }
                    }
                    result.dimensions[field].items.add(rec[field])
                    recDims.push(result.dimensions[field])
                    break;
            }
        })
        recDims.forEach((d) => recMetrics.forEach((m) => {
            d.metrics.add(m.key)
            m.dimensions.add(d.key)
        }))
    })

    result.filters = recommendFilters(result)
    result.charts = recommendCharts(result)
    return result
}

module.exports = deduce
