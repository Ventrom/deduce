# deduce

This package is intended to perform analysis if data sets to identify viable
crossfilter dimensions, groups and make other recommendations for effective
charting of the data set.

Currently is expects structured records of the form:

```javascript
{
    "system": {},
    "activity": {},
    "organization": {},
    "location": {},
    "conditions": [],
    "time": "YYYY-MM-DDTHH:MM:SS",
    "metrics": [
        {"name": "Name of Metric", "value": ###, "units": "unit"},
        ...
    ]
}
```

## Usage

```javascript
const deduce = require('deduce')

let data = ...

let properties = deduce(data)
```
