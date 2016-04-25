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
        records: data
    }

    // process the information in each record
    data.forEach((rec) => {
        Object.keys(rec).forEach((field) => {
            // Process well-known fields
            switch (field) {
                case "location":
                    // TODO store unique location -- lat/lon mappings
                case "system":
                case "activity":
                case "organization":
                    Object.keys(rec[field]).forEach((tag) => {
                        if (!result.dimensions[tag]) {
                            result.dimensions[tag] = {
                                dim: field,
                                key: tag,
                                items: new Set(),
                                accessor: pluck([field, tag])
                            }
                        }
                        result.dimensions[tag].items.add(rec[field][tag])
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
                    if (!result.dimensions["year"]) {
                        ["year", "month", "week", "day", "hour"].forEach((tag) => {
                            result.dimensions[tag] = {
                                dim: "time",
                                key: tag,
                                accessor: pluck([tag])
                            }
                        })
                    }
                    // update the overall time extent
                    result.timeRange[0] = Math.min(result.timeRange[0], rec.dt)
                    result.timeRange[1] = Math.max(result.timeRange[1], rec.dt)
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
                    })
                    break;
                case "rep":

                    break;
            }
        })
    })

    return result
}

module.exports = deduce
