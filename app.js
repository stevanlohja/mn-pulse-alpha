// Wait for the HTML document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // Get filter and chart elements
    const yearFilter = document.getElementById('yearFilter');
    const quarterFilter = document.getElementById('quarterFilter'); 
    const monthFilter = document.getElementById('monthFilter'); // This selector stays the same
    const chartGallery = document.getElementById('chart-gallery');
    
    const aggregateChartCtx = document.getElementById('aggregateChart').getContext('2d');
    const summaryChartCtx = document.getElementById('summaryChart').getContext('2d');
    
    let chartInstances = []; 
    let aggregateChart; 
    let summaryChart; 
    let allData; 

    /**
     * Main function to fetch data and initialize the charts
     */
    async function init() {
        
        try {
            Chart.register(chartjsPluginAnnotation);
        } catch (e) {
            console.error("Failed to register annotation plugin", e);
        }

        try {
            // 1. Fetch data
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allData = await response.json();
            const events = allData.events || [];

            // 2. Populate year filter
            populateYearFilter(allData.datasets);

            // 3. Create Normalized Data (used by both new charts)
            const normalizedData = normalizeAndFormatData(allData.datasets);

            // 4. Create Aggregate Chart
            const aggregateData = createAggregateData(normalizedData);
            aggregateChart = createAggregateChart(aggregateChartCtx, aggregateData, "Aggregate Activity Index", events);

            // 5. Create Summary Chart
            summaryChart = createSummaryChart(summaryChartCtx, normalizedData, "All Metrics - Normalized Trend (0-100)");

            // 6. Dynamically create all individual charts
            allData.datasets.forEach((dataset, index) => {
                const chartContainer = document.createElement('div');
                chartContainer.className = 'bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200';
                
                const canvas = document.createElement('canvas');
                canvas.id = `chart-${index}`; 
                chartContainer.appendChild(canvas);
                chartGallery.appendChild(chartContainer);

                const ctx = canvas.getContext('2d');
                const newChart = createChart(ctx, [dataset], dataset.label); 
                chartInstances.push(newChart);
            });

            // 7. Listen for filter changes
            yearFilter.addEventListener('change', handleFilterChange);
            quarterFilter.addEventListener('change', handleFilterChange); 
            monthFilter.addEventListener('change', handleFilterChange); // This listener is already correct

        } catch (error)
        {
            console.error("Failed to load or initialize chart:", error);
            chartGallery.innerHTML = `<p class="text-center text-gray-600">Error: Could not load data.json. ${error.message}</p>`;
        }
    }
    
    // --- CHARTING FUNCTIONS ---

    function getQuarter(date) {
        const month = date.getMonth(); // 0-11
        return Math.floor(month / 3) + 1; // 1: Q1, 2: Q2, 3: Q3, 4: Q4
    }

    /**
     * Generates annotations with a unique color for each event
     * and ensures the label text has good contrast.
     */
    function generateAnnotations(events) {
        
        // Define a base set of hues (in HSL format)
        const eventHues = [
            { h: 210, s: 100, l: 60 }, // Blue
            { h: 120, s: 70, l: 45 },  // Green
            { h: 45,  s: 100, l: 60 }, // Yellow-Orange
            { h: 260, s: 90, l: 65 },  // Purple
            { h: 0,   s: 80, l: 60 },  // Red
            { h: 160, s: 70, l: 50 }   // Teal
        ];

        return events.map((event, index) => {
            const baseHue = eventHues[index % eventHues.length];

            const backgroundColor = `hsla(${baseHue.h}, ${baseHue.s}%, ${baseHue.l + 30}%, 0.1)`;
            const borderColor = `hsla(${baseHue.h}, ${baseHue.s}%, ${baseHue.l + 20}%, 0.2)`;
            const labelColor = `hsl(${baseHue.h}, ${baseHue.s}%, ${baseHue.l - 20}%)`; 

            return {
                type: 'box',
                xMin: event.startDate,
                xMax: event.endDate,
                backgroundColor: backgroundColor, 
                borderColor: borderColor,
                borderWidth: 1,
                label: {
                    content: event.label,
                    display: true,
                    position: 'start',
                    color: labelColor,
                    font: {
                        size: 10
                    },
                    yAdjust: index * 12
                }
            }
        });
    }

    /**
     * Formats dataset for the *individual* raw-value charts
     */
    function formatDatasetsForChart(datasets) {
        return datasets.map(dataset => ({
            label: dataset.label,
            data: dataset.data.map(point => ({
                x: point.date,
                y: point.value
            })),
            borderColor: dataset.color,
            backgroundColor: dataset.color.replace('1)', '0.2'),
            borderWidth: 2,
            tension: 0.1,
            fill: false,
            spanGaps: true 
        }));
    }

    /**
     * Normalizes (0-100) and formats data
     */
    function normalizeAndFormatData(datasets) {
        return datasets.map(dataset => {
            if (dataset.data.length === 0) {
                return { ...dataset, data: [] };
            }

            const values = dataset.data.map(p => p.value);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min;

            const normalizedData = dataset.data.map(point => {
                let normalizedValue;
                if (range === 0) {
                    normalizedValue = 50; 
                } else {
                    normalizedValue = ((point.value - min) / range) * 100;
                }
                
                return {
                    x: point.date,
                    y: normalizedValue,
                    originalValue: point.value
                };
            });

            return {
                label: dataset.label,
                data: normalizedData,
            };
        });
    }
    
    /**
     * Creates the single-line aggregate data
     */
    function createAggregateData(normalizedDatasets) {
        const dateMap = {}; 

        normalizedDatasets.forEach(dataset => {
            dataset.data.forEach(point => {
                dateMap[point.x] = (dateMap[point.x] || 0) + point.y;
            });
        });

        const aggregateData = Object.keys(dateMap).map(date => ({
            x: date,
            y: dateMap[date]
        }));

        aggregateData.sort((a, b) => new Date(a.x) - new Date(b.x));

        return aggregateData;
    }


    /**
     * Creates an *individual* chart (annotations removed)
     */
    function createChart(canvasContext, datasets, chartTitle) {
        
        const chartColors = {
            gridColor: 'rgba(0, 0, 0, 0.1)',
            tickColor: '#6b7280',
            legendColor: '#374151',
            titleColor: '#000000'
        };
        
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month', tooltipFormat: 'MMM dd, yyyY' },
                    title: { display: true, text: 'Date', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                },
                y: {
                    beginAtZero: true, 
                    title: { display: true, text: 'Value', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    color: chartColors.titleColor,
                    font: { size: 18 }
                },
                tooltip: { mode: 'index', intersect: false },
                legend: { display: false },
                annotation: {
                    annotations: {}
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        };

        return new Chart(canvasContext, {
            type: 'line',
            data: { datasets: formatDatasetsForChart(datasets) },
            options: chartOptions
        });
    }

    /**
     * Creates the *Aggregate* chart (with events)
     */
    function createAggregateChart(canvasContext, aggregateData, chartTitle, events) {
        const chartColors = {
            gridColor: 'rgba(0, 0, 0, 0.1)',
            tickColor: '#6b7280',
            legendColor: '#374151',
            titleColor: '#000000'
        };

        const chartAnnotations = generateAnnotations(events);

        const chartData = {
            datasets: [{
                label: 'Aggregate Activity Index',
                data: aggregateData,
                borderColor: 'rgba(0, 123, 255, 1)',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderWidth: 2,
                tension: 0.1,
                fill: true,
                spanGaps: true
            }]
        };

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month', tooltipFormat: 'MMM dd, yyyY' },
                    title: { display: true, text: 'Date', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                },
                y: {
                    beginAtZero: true, 
                    title: { display: true, text: 'Activity Index Score', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    color: chartColors.titleColor,
                    font: { size: 18 }
                },
                tooltip: { 
                    mode: 'index', 
                    intersect: false
                },
                legend: { 
                    display: false
                },
                annotation: {
                    annotations: chartAnnotations
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        };
        
        return new Chart(canvasContext, {
            type: 'line',
            data: chartData, 
            options: chartOptions
        });
    }

    /**
     * Creates the *summary* chart (annotations removed)
     */
    function createSummaryChart(canvasContext, datasets, chartTitle) {
        
        const chartColors = {
            gridColor: 'rgba(0, 0, 0, 0.1)',
            tickColor: '#6b7280',
            legendColor: '#374151',
            titleColor: '#000000'
        };
        
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month', tooltipFormat: 'MMM dd, yyyY' },
                    title: { display: true, text: 'Date', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                },
                y: {
                    beginAtZero: true, 
                    title: { display: true, text: 'Normalized Trend (0-100)', color: chartColors.titleColor },
                    grid: { color: chartColors.gridColor },
                    ticks: { color: chartColors.tickColor }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    color: chartColors.titleColor,
                    font: { size: 18 }
                },
                tooltip: { 
                    mode: 'index', 
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            const originalValue = context.raw.originalValue;
                            label += originalValue.toLocaleString();
                            return label;
                        }
                    }
                },
                legend: { 
                    display: true, 
                    position: 'top',
                    labels: { color: chartColors.legendColor }
                },
                annotation: {
                    annotations: {}
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        };

        return new Chart(canvasContext, {
            type: 'line',
            data: { datasets: datasets }, 
            options: chartOptions
        });
    }


    function populateYearFilter(datasets) {
        const years = new Set();
        datasets.forEach(dataset => {
            dataset.data.forEach(point => {
                const year = new Date(point.date).getFullYear();
                years.add(year);
            });
        });
        Array.from(years).sort((a, b) => b - a).forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }

    /**
     * UPDATED: Now handles month-over-month filter
     */
    function handleFilterChange() {
        const selectedYear = yearFilter.value;
        const selectedQuarter = quarterFilter.value; 
        const selectedMonth = monthFilter.value; // This will be "all" or "0-1", "1-2", etc.
        
        const filteredDatasets = []; 

        allData.datasets.forEach((originalDataset, index) => {
            
            let filteredData = originalDataset.data;

            // 1. Filter by year
            if (selectedYear !== 'all') {
                filteredData = filteredData.filter(point => {
                    return new Date(point.date).getFullYear().toString() === selectedYear;
                });
            }
            
            // 2. Filter by quarter
            if (selectedQuarter !== 'all') {
                filteredData = filteredData.filter(point => {
                    const d = new Date(point.date);
                    const q = getQuarter(d); 
                    return q.toString() === selectedQuarter;
                });
            }

            // 3. NEW: Filter by month-over-month
            if (selectedMonth !== 'all') {
                // selectedMonth is a string like "0-1"
                const [monthStart, monthEnd] = selectedMonth.split('-').map(Number);

                filteredData = filteredData.filter(point => {
                    const month = new Date(point.date).getMonth();
                    // Show data if its month is the start OR end of the selected range
                    return month === monthStart || month === monthEnd;
                });
            }
            
            const updatedDataset = { ...originalDataset, data: filteredData };
            
            // 4. Update the individual chart
            const chart = chartInstances[index];
            if (chart) {
                chart.data.datasets = formatDatasetsForChart([updatedDataset]);
                chart.update();
            }
            
            // 5. Add the filtered data for the summary/aggregate charts
            filteredDatasets.push(updatedDataset);
        });

        // 6. Re-normalize and update the Summary chart
        const normalizedDatasets = normalizeAndFormatData(filteredDatasets);
        summaryChart.data.datasets = normalizedDatasets;
        summaryChart.update();
        
        // 7. Re-calculate and update the Aggregate chart
        const aggregateData = createAggregateData(normalizedDatasets);
        aggregateChart.data.datasets[0].data = aggregateData;
        aggregateChart.update();
    }
    // --- END CHARTING FUNCTIONS ---

    // Start the application
    init();
});