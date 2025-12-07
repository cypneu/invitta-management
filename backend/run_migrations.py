#!/usr/bin/env python3
"""
Standalone migration script for Hostido
Run this script manually via panel or SSH to apply database migrations
"""
import sys
import os

# Add application to path
app_path = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_path)

def run_migrations():
    """Run all pending database migrations"""
    print("Starting migrations...")
    
    try:
        from alembic.config import Config
        from alembic import command
        
        alembic_cfg = Config(os.path.join(app_path, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(app_path, "alembic"))
        
        command.upgrade(alembic_cfg, "head")
        print("Migrations completed successfully!")
        return True
    except Exception as e:
        print(f"Migration error: {e}")
        return False

if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
