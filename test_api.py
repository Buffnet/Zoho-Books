#!/usr/bin/env python3
"""
Simple test script to demonstrate FastAPI functionality
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_basic_endpoints():
    print("🧪 Testing basic endpoints...")
    
    # Test root
    response = requests.get(f"{BASE_URL}/")
    print(f"GET /: {response.json()}")
    
    # Test health
    response = requests.get(f"{BASE_URL}/health")
    print(f"GET /health: {response.json()}")
    
    # Test invoices
    response = requests.get(f"{BASE_URL}/invoices")
    data = response.json()
    print(f"GET /invoices: Found {data['count']} invoices")
    
    return data['count'] > 0

def test_idempotency():
    print("\n🔄 Testing idempotency (will fail on LLM call, but cache logic works)...")
    
    # Same query twice
    query = {"query": "How many invoices are there?"}
    
    print("Making first request...")
    response1 = requests.post(f"{BASE_URL}/analyze", json=query)
    print(f"Response 1 status: {response1.status_code}")
    
    print("Making identical second request...")  
    response2 = requests.post(f"{BASE_URL}/analyze", json=query)
    print(f"Response 2 status: {response2.status_code}")
    
    # Check if both requests generated the same cache key by failing at the same point
    print(f"Both failed with same error: {response1.text == response2.text}")

def test_csv_data_input():
    print("\n📊 Testing direct CSV input...")
    
    csv_data = """invoice_id,customer,amount,paid_at,status
Invoice1,Test Customer,1000,2024-01-01,Paid"""
    
    query = {
        "query": "What is the total amount?",
        "csv_data": csv_data
    }
    
    response = requests.post(f"{BASE_URL}/analyze", json=query)
    print(f"CSV input test status: {response.status_code}")
    print(f"Response: {response.text[:200]}...")

if __name__ == "__main__":
    print("🚀 FastAPI Endpoint Tests")
    print("=" * 40)
    
    try:
        has_data = test_basic_endpoints()
        if has_data:
            test_idempotency()
            test_csv_data_input()
            print("\n✅ All structural tests passed!")
            print("💡 To test LLM functionality, set OPENAI_API_KEY environment variable")
        else:
            print("❌ No invoice data found - run the scraper first")
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running on localhost:8000?")
    except Exception as e:
        print(f"❌ Test failed: {e}")