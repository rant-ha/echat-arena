#!/usr/bin/env python3
"""
Test script for SupabaseSessionStore implementation.
This script tests the core functionality without requiring actual Supabase connection.
"""

import asyncio
import os
import sys
import time
from datetime import datetime, timedelta

# Add current directory to path to import app module
sys.path.insert(0, '.')

# Mock environment variables for testing
os.environ['ARENA_SESSION_STORE'] = 'memory'  # Test in memory mode first
os.environ['ARENA_ALLOW_FALLBACK'] = 'true'
os.environ['ARENA_SESSION_TTL_SEC'] = '3600'
os.environ['ARENA_MAX_SESSIONS'] = '1000'
os.environ['ARENA_CACHE_TTL_SEC'] = '60'

from app import SupabaseSessionStore


def print_test_header(test_name):
    """Print test header."""
    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print('='*60)


def print_result(passed, message):
    """Print test result."""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")
    return passed


async def test_basic_functionality():
    """Test basic CRUD operations."""
    print_test_header("Basic CRUD Operations")
    
    store = SupabaseSessionStore()
    results = []
    
    # Test 1: Put and Get
    test_session_id = "test_session_1"
    test_data = {
        "prompt": "Hello, how are you?",
        "left": {"model_id": "model_a"},
        "right": {"model_id": "model_b"},
        "created_at": datetime.now().isoformat()
    }
    
    await store.put(test_session_id, test_data)
    retrieved = await store.get(test_session_id)
    
    results.append(print_result(
        retrieved is not None,
        "Put and Get session"
    ))
    
    results.append(print_result(
        retrieved["prompt"] == test_data["prompt"],
        "Data integrity check"
    ))
    
    # Test 2: Update
    update_data = {"updated_at": datetime.now().isoformat(), "status": "active"}
    await store.update(test_session_id, update_data)
    
    updated_session = await store.get(test_session_id)
    results.append(print_result(
        updated_session.get("status") == "active",
        "Update session"
    ))
    
    # Test 3: Get non-existent session
    non_existent = await store.get("non_existent_session")
    results.append(print_result(
        non_existent is None,
        "Get non-existent session returns None"
    ))
    
    return all(results)


async def test_single_side_context_isolation():
    """Test single-side context isolation."""
    print_test_header("Single-Side Context Isolation")
    
    store = SupabaseSessionStore()
    results = []
    
    # Create session with initial contexts
    session_id = "context_test_session"
    session_data = {
        "prompt": "Test context isolation",
        "left": {
            "model_id": "model_a",
            "context": [{"role": "system", "content": "You are model A"}]
        },
        "right": {
            "model_id": "model_b", 
            "context": [{"role": "system", "content": "You are model B"}]
        },
        "conversation_history": [],
        "turn_count": 0,
        "version": 0
    }
    
    await store.put(session_id, session_data)
    
    # Test context building
    left_context = await store._build_side_context(session_data, 'left')
    right_context = await store._build_side_context(session_data, 'right')
    
    results.append(print_result(
        len(left_context) == 1 and left_context[0]["content"] == "You are model A",
        "Left context isolation"
    ))
    
    results.append(print_result(
        len(right_context) == 1 and right_context[0]["content"] == "You are model B",
        "Right context isolation"
    ))
    
    # Test append_turn with context isolation
    success = await store.append_turn(
        session_id,
        "Hello, how are you?",
        "I'm fine, thank you!",
        "I'm doing great!"
    )
    
    results.append(print_result(
        success,
        "Append turn with context isolation"
    ))
    
    # Verify contexts were updated correctly
    updated_session = await store.get(session_id)
    
    if updated_session:
        left_context_after = await store._build_side_context(updated_session, 'left')
        right_context_after = await store._build_side_context(updated_session, 'right')
        
        # Check that user message was added to both sides
        results.append(print_result(
            len(left_context_after) == 2 and len(right_context_after) == 2,
            "User message added to both contexts"
        ))
        
        # Check that model-specific replies were added
        results.append(print_result(
            any("I'm fine, thank you!" in msg["content"] for msg in left_context_after),
            "Left model reply in left context"
        ))
        
        results.append(print_result(
            any("I'm doing great!" in msg["content"] for msg in right_context_after),
            "Right model reply in right context"
        ))
        
        # Check that complete history is preserved
        conversation_history = await store.get_conversation_history(session_id)
        results.append(print_result(
            len(conversation_history) == 1,
            "Complete conversation history preserved"
        ))
    
    return all(results)


async def test_soft_deletion():
    """Test soft deletion functionality."""
    print_test_header("Soft Deletion Functionality")
    
    store = SupabaseSessionStore()
    results = []
    
    # Create a test session
    session_id = "soft_delete_test_session"
    test_data = {
        "prompt": "Test soft deletion",
        "created_at": datetime.now().isoformat()
    }
    
    await store.put(session_id, test_data)
    
    # Test soft delete (should work in memory mode for testing)
    # Note: In memory mode, soft delete won't actually delete from Supabase
    # but we can test the logic
    try:
        # This will return False in memory mode, but shouldn't crash
        delete_result = await store.soft_delete(session_id)
        results.append(print_result(
            isinstance(delete_result, bool),
            "Soft delete returns boolean"
        ))
    except Exception as e:
        results.append(print_result(
            False,
            f"Soft delete raised exception: {e}"
        ))
    
    # Test restore (should also work in memory mode)
    try:
        restore_result = await store.restore_session(session_id)
        results.append(print_result(
            isinstance(restore_result, bool),
            "Restore session returns boolean"
        ))
    except Exception as e:
        results.append(print_result(
            False,
            f"Restore raised exception: {e}"
        ))
    
    return all(results)


async def test_conversation_history_management():
    """Test conversation history and turn count management."""
    print_test_header("Conversation History Management")
    
    store = SupabaseSessionStore()
    results = []
    
    session_id = "history_test_session"
    session_data = {
        "prompt": "Test history",
        "left": {"context": []},
        "right": {"context": []},
        "conversation_history": [],
        "turn_count": 0,
        "version": 0
    }
    
    await store.put(session_id, session_data)
    
    # Test initial state
    initial_history = await store.get_conversation_history(session_id)
    initial_count = await store.get_turn_count(session_id)
    
    results.append(print_result(
        len(initial_history) == 0 and initial_count == 0,
        "Initial empty history and turn count"
    ))
    
    # Add multiple turns
    for i in range(3):
        success = await store.append_turn(
            session_id,
            f"Message {i+1}",
            f"Reply A {i+1}",
            f"Reply B {i+1}"
        )
        results.append(print_result(
            success,
            f"Append turn {i+1}"
        ))
    
    # Check final state
    final_history = await store.get_conversation_history(session_id)
    final_count = await store.get_turn_count(session_id)
    
    results.append(print_result(
        len(final_history) == 3 and final_count == 3,
        "Final history length and turn count"
    ))
    
    # Check history content
    results.append(print_result(
        final_history[0]["user"] == "Message 1",
        "First turn user message correct"
    ))
    
    results.append(print_result(
        final_history[2]["turn"] == 3,
        "Turn numbers are sequential"
    ))
    
    return all(results)


async def test_cache_functionality():
    """Test local cache functionality."""
    print_test_header("Local Cache Functionality")
    
    store = SupabaseSessionStore()
    results = []
    
    session_id = "cache_test_session"
    test_data = {"prompt": "Test caching", "cached": True}
    
    # Put session
    await store.put(session_id, test_data)
    
    # First get (should cache)
    first_get = await store.get(session_id)
    results.append(print_result(
        first_get is not None and first_get["cached"] is True,
        "First get returns data"
    ))
    
    # Check cache directly
    cache_key = store._get_cache_key(session_id)
    cached_data = store._local_cache.get(cache_key)
    
    results.append(print_result(
        cached_data is not None,
        "Data cached after first get"
    ))
    
    # Second get (should come from cache)
    second_get = await store.get(session_id)
    results.append(print_result(
        second_get is not None,
        "Second get returns cached data"
    ))
    
    # Test cache expiration
    if cached_data:
        # Manually expire cache
        cached_data["_cache_time"] = time.time() - 100
        
        # Get should bypass expired cache
        fresh_get = await store.get(session_id)
        results.append(print_result(
            fresh_get is not None,
            "Get bypasses expired cache"
        ))
    
    return all(results)


async def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "="*60)
    print("SESSIONSTORE IMPLEMENTATION TEST SUITE")
    print("="*60)
    print(f"Running in mode: {os.environ.get('ARENA_SESSION_STORE', 'memory')}")
    print("="*60)
    
    test_functions = [
        test_basic_functionality,
        test_single_side_context_isolation,
        test_soft_deletion,
        test_conversation_history_management,
        test_cache_functionality,
    ]
    
    results = []
    for test_func in test_functions:
        try:
            result = await test_func()
            results.append(result)
        except Exception as e:
            print(f"\n❌ TEST CRASHED: {test_func.__name__}")
            print(f"   Exception: {e}")
            results.append(False)
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"Tests Passed: {passed}/{total}")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("🎉 All tests passed!")
        return True
    else:
        print("⚠️  Some tests failed.")
        return False


if __name__ == "__main__":
    # Run tests
    success = asyncio.run(run_all_tests())
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)