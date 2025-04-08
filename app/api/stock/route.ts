import { type NextRequest, NextResponse } from "next/server"
import yahooFinance from "yahoo-finance2"

// Mock data for demonstration purposes
// const mockStockData = { ... }; // Remove this entire block

// Generate mock historical price data
// function generateMockPrices(...) { ... } // Remove this entire function

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get("symbol")?.toUpperCase()
  const timeframe = searchParams.get("timeframe") || "2y"; // Default to 2y if not provided

  if (!symbol) {
    return NextResponse.json({ error: "Stock symbol is required" }, { status: 400 })
  }

  try {
    // Calculate date range based on timeframe parameter
    const endDate = new Date()
    let startDate = new Date()

    switch (timeframe) {
        case "1y":
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        case "3y":
            startDate.setFullYear(endDate.getFullYear() - 3);
            break;
        case "5y":
            startDate.setFullYear(endDate.getFullYear() - 5);
            break;
        case "all":
            startDate = new Date(0); // Set to Unix epoch start for all time
            break;
        case "2y": // Explicitly handle the default case
        default:
            startDate.setFullYear(endDate.getFullYear() - 2); // Default case
            break;
    }

    const formattedStartDate = startDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    const formattedEndDate = endDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

    console.log(`Fetching data for ${symbol} from ${formattedStartDate} to ${formattedEndDate} (Timeframe: ${timeframe})`);

    // Fetch historical data using chart() instead of historical()
    const chartResult = await yahooFinance.chart(symbol, {
      period1: formattedStartDate,
      period2: formattedEndDate,
      interval: "1d",
    });

    // Extract quotes from the chart result
    const history = chartResult.quotes || [];

    // Fetch quote data for company name
    const quote = await yahooFinance.quote(symbol)
    const name = quote?.longName || quote?.shortName || `${symbol} Inc.` // Use longName, shortName, or fallback

    // Format prices, now including OHLC data
    const prices = history
      .map((data) => {
        // Use adjclose (lowercase) and handle potential nulls for both adjclose and close
        const priceValue = data.adjclose ?? data.close;
        const open = data.open;
        const high = data.high;
        const low = data.low;
        const close = data.close; // This is the unadjusted close

        // Ensure all values needed for candlestick are numbers
        if (priceValue === null || priceValue === undefined ||
            open === null || open === undefined ||
            high === null || high === undefined ||
            low === null || low === undefined ||
            close === null || close === undefined) {
            return null; // Skip data points with missing essential values
        }

        return {
            date: data.date.toISOString().split("T")[0], // Format date as YYYY-MM-DD
            // Keep 'price' as the adjusted close for consistency with potential DCA calculations
            price: Number.parseFloat(priceValue.toFixed(2)),
            // Add OHLC data for candlestick charts
            open: Number.parseFloat(open.toFixed(2)),
            high: Number.parseFloat(high.toFixed(2)),
            low: Number.parseFloat(low.toFixed(2)),
            close: Number.parseFloat(close.toFixed(2)), // Unadjusted close
        };
      })
      // Filter out any null entries resulting from missing data
      .filter(data => data !== null);

    if (prices.length === 0) {
        // Handle cases where historical data might be empty for valid symbols (e.g., very new stocks)
        console.warn(`No historical data found for symbol: ${symbol}`);
        // Decide how to handle this - return empty array or an error?
        // Let's return the structure but with empty prices for now.
    }

    const stockData = {
      symbol,
      name,
      prices,
    }

    return NextResponse.json(stockData)

  } catch (error: any) {
    console.error(`Error fetching data for ${symbol}:`, error)

    // Check for specific Yahoo Finance errors (e.g., symbol not found)
    // The error structure might vary, inspect error object for details
    if (error.message?.includes("No data found") || error.code === 'Not Found') {
       return NextResponse.json({ error: `Stock symbol ${symbol} not found or no data available` }, { status: 404 })
    }
    // Generic server error for other issues
    return NextResponse.json({ error: "Failed to fetch stock data" }, { status: 500 })
  }
}

