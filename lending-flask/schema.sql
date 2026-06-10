-- =============================================
-- GOMTI NAGAR LENDING MANAGEMENT SYSTEM
-- =============================================

CREATE DATABASE IF NOT EXISTS lending_db;
USE lending_db;

-- Funding Slots (8 Kothis)
CREATE TABLE funding_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_name VARCHAR(100) NOT NULL,        -- e.g. "GOMTI NAGAR", "Slot 2"
  kothi_amount DECIMAL(12,2) DEFAULT 0,  -- Total invested capital
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers (one per loan entry)
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT NOT NULL,
  sl_no INT NOT NULL,                        -- Serial number within slot+month
  opening_date DATE NOT NULL,
  customer_name VARCHAR(200) NOT NULL,
  funding DECIMAL(12,2) NOT NULL,            -- Amount lent
  profit_28_percent DECIMAL(12,2) GENERATED ALWAYS AS (funding * 0.28) STORED,
  staff_commission DECIMAL(12,2) GENERATED ALWAYS AS (funding * 0.08) STORED,
  net_income DECIMAL(12,2) GENERATED ALWAYS AS (funding * 0.20) STORED,
  total_payment_to_be_made DECIMAL(12,2) GENERATED ALWAYS AS (funding + funding * 0.28) STORED,
  payment_has_been_done DECIMAL(12,2) DEFAULT 0,
  balance_recovery DECIMAL(12,2) GENERATED ALWAYS AS (
    (funding + funding * 0.28) - payment_has_been_done
  ) STORED,
  month_year VARCHAR(7) NOT NULL,            -- Format: '2026-06'
  is_closed TINYINT(1) DEFAULT 0,
  daily_recovery DECIMAL(12,2) DEFAULT 0,
  FOREIGN KEY (slot_id) REFERENCES funding_slots(id)
);

-- Monthly Summary per Slot
CREATE TABLE monthly_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT NOT NULL,
  month_year VARCHAR(7) NOT NULL,
  total_funding DECIMAL(12,2) DEFAULT 0,
  total_running_funding DECIMAL(12,2) DEFAULT 0,
  total_funding_and_profit DECIMAL(12,2) DEFAULT 0,
  actual_recovery DECIMAL(12,2) DEFAULT 0,
  total_profit_current DECIMAL(12,2) DEFAULT 0,
  staff_commission_total DECIMAL(12,2) DEFAULT 0,
  salary_and_other DECIMAL(12,2) DEFAULT 0,
  net_profit DECIMAL(12,2) DEFAULT 0,
  FOREIGN KEY (slot_id) REFERENCES funding_slots(id),
  UNIQUE KEY unique_slot_month (slot_id, month_year)
);

-- Insert 8 default funding slots
INSERT INTO funding_slots (slot_name, kothi_amount) VALUES
('Gomti Nagar', 800000),
('Slot 2', 0),
('Slot 3', 0),
('Slot 4', 0),
('Slot 5', 0),
('Slot 6', 0),
('Slot 7', 0),
('Slot 8', 0);
