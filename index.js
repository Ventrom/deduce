'use strict'

const d3 = require('d3')
const camelCase = require('camelcase')

function pluck(keys) {
    return function(r) {
        let result = r
        for (let k of keys) {
            if (typeof(result[k]) === "undefined") return "n/a"
            result = result[k]
        }
        return result
    }
}

function pluckMetric(name) {
    return function(r) {
        for (let m of r.metrics) {
            if (m.name === name) return m.value
        }
        return null
    }
}

function recommendFilters() {
    let result = []

    Object.keys(this.dimensions).forEach((tag) => {
        let d = this.dimensions[tag]
        if (d.dim === "time") return
        let type = d.items.length > 6 ? "row" : "pie"
        d.metrics.forEach((m) => result.push({"dim": d.dim, "type": type, "dtag": d.key, "gtag": m, "gname": this.groups[m].title}))
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
        timeRange: [Infinity, 0],
        records: data,
        filters: recommendFilters
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
                    // TODO store unique location -- lat/lon mappings
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
                                accessor: pluck([field, tag]),
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
                                accessor: pluck([tag]),
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
                        var id = camelCase(m.name)
                        if (!result.groups[id]) {
                            result.groups[id] = {
                                title: m.name,
                                units: m.units,
                                accessor: pluckMetric(m.name)
                            }
                        }
                        recMetrics.push(id)
                    })
                    break;
                case "rep":

                    break;
            }
        })
        recDims.forEach((d) => d.metrics.add.apply(d.metrics, recMetrics))
    })

    return result
}

module.exports = deduce
