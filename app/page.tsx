"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { createChart, CrosshairMode, LineStyle, UTCTimestamp, IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';
import { formatCurrency } from "@/lib/utils";

// --- Interfaces (similar to dca-calculator) ---
interface StockPriceData {
  date: string; // YYYY-MM-DD
  price: number; // Adjusted Close
  // Add other fields if needed, price (adjusted close) is primary here
}

interface StockData {
  symbol: string;
  prices: StockPriceData[];
  name?: string; // Optional name
}

// Data structure for the chart series
interface PerformancePoint {
  time: UTCTimestamp;
  value: number; // The value of the $100 investment
}

// Final comparison results structure
interface ComparisonResult {
  ticker1: string;
  ticker2: string;
  series1: PerformancePoint[];
  series2: PerformancePoint[];
  finalValue1: number;
  finalValue2: number;
}
// --- End Interfaces ---

// Define timeframe options
type ComparisonTimeframe = "1y" | "3y" | "5y" | "all"; // Added 'all'

// Helper to convert YYYY-MM-DD string to UTCTimestamp (duplicate from dca-calculator, consider moving to lib/utils)
const dateToUTCTimestamp = (dateString: string): UTCTimestamp => {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 1000 as UTCTimestamp;
};

export default function StockComparatorPage() {
  const [ticker1, setTicker1] = useState("");
  const [ticker2, setTicker2] = useState("");
  const [timeframe, setTimeframe] = useState<ComparisonTimeframe>("1y");
  const [comparisonData, setComparisonData] = useState<ComparisonResult | null>(null); // Use defined type
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // State for hover values
  // const [hoveredTime, setHoveredTime] = useState<string | null>(null); // Keep these if hover is implemented
  // const [hoverValue1, setHoverValue1] = useState<number | null>(null);
  // const [hoverValue2, setHoverValue2] = useState<number | null>(null);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const series1Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const series2Ref = useRef<ISeriesApi<"Line"> | null>(null);

  // Helper to get start date (duplicate from dca-calculator, consider moving to lib/utils)
  const getTimeframeStartDate = useCallback((endDate: Date, option: ComparisonTimeframe): Date => {
    const result = new Date(endDate);
    switch (option) {
      case "1y":
        result.setFullYear(endDate.getFullYear() - 1);
        break;
      case "3y":
        result.setFullYear(endDate.getFullYear() - 3);
        break;
      case "5y":
        result.setFullYear(endDate.getFullYear() - 5);
        break;
      // Add 'all' case later if needed
      case "all":
        // Return a very early date to signify fetching all available data
        return new Date(0); // Start of Unix epoch
      default:
        result.setFullYear(endDate.getFullYear() - 1); // Default to 1 year
    }
    // Go back one more day to ensure we get the closing price *before* the period starts
    result.setDate(result.getDate() - 1);
    return result;
  }, []);

  // Function to process fetched data into performance series
  const processData = (stockData: StockData[], startDate: Date): { series: PerformancePoint[], finalValue: number } | null => {
      // Ensure data exists and has prices
      if (!stockData || !stockData[0]?.prices || stockData[0].prices.length === 0) return null;
      
      // Sort prices just in case
      const prices = [...stockData[0].prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Find the first data point ON or AFTER the calculated start date
      const startIndex = prices.findIndex(p => new Date(p.date).getTime() >= startDate.getTime());
      if (startIndex === -1 || startIndex >= prices.length) {
        console.warn(`No data found for ${stockData[0].symbol} on or after ${startDate.toISOString().split('T')[0]}`);
        return null; // No data in the timeframe
      }
      
      const startPrice = prices[startIndex].price;
      if (startPrice <= 0) return null; // Avoid division by zero

      const performanceSeries: PerformancePoint[] = [];
      // Filter prices starting from the found startIndex
      const relevantPrices = prices.slice(startIndex);

      for (const point of relevantPrices) {
          const currentValue = 100 * (point.price / startPrice);
          performanceSeries.push({
              time: dateToUTCTimestamp(point.date),
              value: currentValue,
          });
      }
      
      const finalValue = performanceSeries.length > 0 ? performanceSeries[performanceSeries.length - 1].value : 100;

      return { series: performanceSeries, finalValue };
  };

  // NEW function to fetch and process data
  const fetchComparisonData = useCallback(async () => {
      if (!ticker1 || !ticker2) {
          // Don't fetch if tickers aren't filled
          setComparisonData(null); // Clear old data if tickers become incomplete
          setError(""); // Clear error if inputs are cleared
          return;
      }

      setLoading(true);
      setError("");
      // comparisonData is cleared within the effect before calling this

      const endDate = new Date();
      const startDate = getTimeframeStartDate(endDate, timeframe);

      try {
          const [response1, response2] = await Promise.all([
              fetch(`/api/stock?symbol=${ticker1.toUpperCase()}&timeframe=${timeframe}`),
              fetch(`/api/stock?symbol=${ticker2.toUpperCase()}&timeframe=${timeframe}`)
          ]);

          if (!response1.ok || !response2.ok) {
              let errorMsg = "Failed to fetch stock data.";
              if (!response1.ok) errorMsg += ` Check ticker ${ticker1}.`;
              if (!response2.ok) errorMsg += ` Check ticker ${ticker2}.`;
              throw new Error(errorMsg);
          }

          const data1 = await response1.json();
          const data2 = await response2.json();

          const processed1 = processData([data1], startDate);
          const processed2 = processData([data2], startDate);

          if (!processed1 || !processed2) {
              let errorMsg = "Could not process data for comparison.";
              if (!processed1) errorMsg += ` Check data availability for ${ticker1}.`;
              if (!processed2) errorMsg += ` Check data availability for ${ticker2}.`;
              throw new Error(errorMsg);
          }

          setComparisonData({
              ticker1: ticker1.toUpperCase(),
              ticker2: ticker2.toUpperCase(),
              series1: processed1.series,
              series2: processed2.series,
              finalValue1: processed1.finalValue,
              finalValue2: processed2.finalValue,
          });

      } catch (err: any) {
          setError(err.message || "An unknown error occurred.");
          setComparisonData(null); // Clear data on error
          console.error(err);
      } finally {
          setLoading(false);
      }
  }, [ticker1, ticker2, timeframe, getTimeframeStartDate]); // Include dependencies

  // --- Effect for Dynamic Updates with Debounce ---
  useEffect(() => {
      // Clear previous data and errors immediately when inputs change
      setComparisonData(null);
      setError("");

      if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
      }

      if (ticker1 && ticker2) {
          // Set loading true immediately for responsiveness
          setLoading(true); 
          debounceTimerRef.current = setTimeout(() => {
              fetchComparisonData();
          }, 500); // 500ms debounce
      } else {
          // If tickers are incomplete, ensure loading is false
          setLoading(false);
      }

      // Cleanup function to clear timeout if component unmounts or dependencies change
      return () => {
          if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
          }
      };
  }, [ticker1, ticker2, timeframe, fetchComparisonData]); // Rerun when tickers, timeframe or the fetch function changes

  // --- Chart Effect --- 
  useEffect(() => {
    if (!chartContainerRef.current || !comparisonData) {
      // Clean up chart if data clears or container disappears
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      series1Ref.current = null;
      series2Ref.current = null;
      return;
    }

    // Initialize chart or update data
    if (!chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 350, // Match placeholder height
        layout: {
          background: { color: 'transparent' },
          textColor: '#A1A1AA', // zinc-500
        },
        grid: {
          vertLines: { color: '#3f3f46' }, // zinc-700
          horzLines: { color: '#3f3f46' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        timeScale: {
          borderColor: '#3f3f46',
          timeVisible: true,
          secondsVisible: false,
        },
        // Optional: Add Price Scale formatting if needed
        // rightPriceScale: { ... }
      });
    }

    const chart = chartRef.current;

    // Add or update series 1
    if (!series1Ref.current) {
      series1Ref.current = chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2 }); // green-500
    } else {
        if (series1Ref.current) {
          series1Ref.current.setData([]); // Clear old data before setting new
        }
    }
    if (series1Ref.current) {
      series1Ref.current.setData(comparisonData.series1);
    }
    
    // Add or update series 2
    if (!series2Ref.current) {
      series2Ref.current = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 }); // blue-500
    } else {
        if (series2Ref.current) {
          series2Ref.current.setData([]); // Clear old data
        }
    }
    if (series2Ref.current) {
      series2Ref.current.setData(comparisonData.series2);
    }

    chart.timeScale().fitContent(); // Adjust timescale to fit data

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove the chart here if we want it to persist between data updates
      // chart.remove(); 
      // chartRef.current = null;
    };

  }, [comparisonData]); // Rerun effect when comparisonData changes


  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Stock Performance Comparator</h1>
      
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Compare Two Stocks</CardTitle>
          <CardDescription>Enter two stock tickers and select a timeframe to see how a $100 investment would have performed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Input Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="ticker1">Ticker 1</Label>
              <Input 
                id="ticker1" 
                placeholder="e.g., AAPL" 
                value={ticker1} 
                onChange={(e) => setTicker1(e.target.value.toUpperCase())} 
              />
            </div>
            <div>
              <Label htmlFor="ticker2">Ticker 2</Label>
              <Input 
                id="ticker2" 
                placeholder="e.g., MSFT" 
                value={ticker2} 
                onChange={(e) => setTicker2(e.target.value.toUpperCase())} 
              />
            </div>
          </div>

          {/* Timeframe Selection */}
          <div className="flex flex-wrap gap-2 items-center">
             <Label className="mr-2">Timeframe:</Label>
             <Button variant={timeframe === '1y' ? 'default' : 'outline'} onClick={() => setTimeframe('1y')} size="sm">1 Year</Button>
             <Button variant={timeframe === '3y' ? 'default' : 'outline'} onClick={() => setTimeframe('3y')} size="sm">3 Years</Button>
             <Button variant={timeframe === '5y' ? 'default' : 'outline'} onClick={() => setTimeframe('5y')} size="sm">5 Years</Button>
             <Button variant={timeframe === 'all' ? 'default' : 'outline'} onClick={() => setTimeframe('all')} size="sm">All Time</Button>
          </div>
            
          {error && <p className="text-sm text-red-500 text-center mt-2">{error}</p>}

          {/* Results Section (Chart and Final Values) */}
          {loading && (
            <div className="text-center mt-6 flex justify-center items-center">
               <Loader2 className="h-5 w-5 animate-spin mr-2" />
               <span>Loading comparison data...</span>
            </div>
          )}
          
          {comparisonData && !loading && (
            <div className="mt-6 space-y-4">
              <h3 className="text-xl font-semibold text-center">Performance of $100 Investment ({timeframe === 'all' ? 'All Time' : timeframe.replace('y', ' Year')})</h3>
              {/* Chart Container */}
              <div ref={chartContainerRef} className="w-full h-[350px] bg-transparent rounded-md">
                 {/* Chart is rendered by useEffect */} 
              </div>
              {/* Final values display */}
              <div className="grid grid-cols-2 gap-4 text-center pt-4 border-t">
                 <div>
                    <p className="text-sm text-muted-foreground">{comparisonData.ticker1}</p>
                    <p className="text-lg font-semibold text-green-500">{formatCurrency(comparisonData.finalValue1)}</p>
                 </div>
                 <div>
                    <p className="text-sm text-muted-foreground">{comparisonData.ticker2}</p>
                    <p className="text-lg font-semibold text-blue-500">{formatCurrency(comparisonData.finalValue2)}</p>
                 </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
} 