package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"
	"github.com/redis/go-redis/v9"

)

var ctx = context.Background();

type StockTick struct {
	Symbol  string `json:"symbol"`
	Price float64 `json:"price"`
	Timestamp int64 `json:"timestamp"`
}

func main() {
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		Password: "",
		DB: 0,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Could not connect to Redis: %v", err)
	}

	fmt.Println("🚀 Go Market Data Service connected to Redis successfully.")

	stocks := map[string] float64{
		"RELIANCE": 2500.00,
		"TCS":      3400.00,
		"INFY":     1500.00,
		"HDFC":     1650.00,
	}

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()


	for range ticker.C{
		for symbol, basePrice := range stocks{
			fluctuation := (rand.Float64() -0.49) * 5.0
			newPrice := basePrice + fluctuation
			stocks[symbol] = newPrice

			tick := StockTick{
				Symbol:    symbol,
				Price:     newPrice,
				Timestamp: time.Now().UnixMilli(),
			}

			payload, err := json.Marshal(tick)
			if err != nil {
				log.Printf("Error marshalling stock tick: %v", err)
				continue
			}
			err = rdb.Publish(ctx, "market_ticks", payload).Err()
			if err != nil {
				log.Printf("Error publishing stock tick: %v", err)
			} else {
				fmt.Printf("📈 Broadcasted Tick -> Symbol: %s | Price: %.2f\n", tick.Symbol, tick.Price)
			}
		}
	}
}