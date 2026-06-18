# Pulse | Modern Uptime Monitor

Pulse is a lightweight, full-stack uptime monitoring application designed for early-stage startups and small-scale operations. It periodically pings a list of registered URLs (every 60 seconds), tracks response times, and renders service statuses dynamically on a premium, responsive glassmorphic dashboard.

---

## ⚡ 1-Line Setup

You can spin up the entire ecosystem (MongoDB database, Express API, React frontend) locally with a single command:

```bash
docker compose up --build
```

- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Backend API Server:** [http://localhost:5000](http://localhost:5000)
- **MongoDB Database:** Port `27017`

---

## 🧪 How to Verify the Application

To verify that the monitor correctly logs and displays "UP" and "DOWN" states, follow these steps:

1. **Open the Dashboard:** Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.
2. **Add a Healthy URL:**
   - In the **Add New Endpoint** form, type `https://example.com` (or `https://google.com`).
   - Click **Monitor URL**.
   - **Verification:** The URL will instantly appear in the grid showing an **ONLINE** green status badge, its current response time (e.g. `142 ms`), and a green indicator dot.
3. **Add an Intentionally Broken URL:**
   - In the form, register `https://thisdomaindoesnotexist123.com` (invalid domain) or `https://httpstat.us/500` (service error).
   - Click **Monitor URL**.
   - **Verification:** The URL will immediately display an **OFFLINE** red status badge, `-- ms` average, and a red indicator dot.
4. **Inspect Interactive Details:**
   - **Tooltips:** Hover over any dot in the 10-ping history bar. A custom tooltip will slide up detailing the exact status, response time, and local timestamp of that check.
   - **Real-time Sparklines:** As the background pinger cycles every minute, the SVG sparkline graph on each card will draw line fluctuations matching the last 10 ping latencies.

---

## ☁️ Deployment Sketch (Infrastructure-as-Code)

Below is a brief Terraform configuration demonstrating how this MVP application can be deployed securely to AWS. It hosts the Postgres database on a managed Amazon RDS instance, runs the backend container on AWS App Runner, and hosts the React static frontend assets on Amazon S3 distributed via CloudFront.

```hcl
# AWS Provider Configuration
provider "aws" {
  region = "us-east-1"
}

# 1. Managed PostgreSQL Database (Amazon RDS)
resource "aws_db_instance" "postgres" {
  identifier           = "pulse-db"
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t4g.micro"
  db_name              = "uptime_monitor"
  username             = "db_user"
  password             = var.db_password
  skip_final_snapshot  = true
}

# 2. Express Backend API (AWS App Runner)
resource "aws_apprunner_service" "backend" {
  service_name = "pulse-backend-api"

  source_configuration {
    image_repository {
      image_identifier      = "${aws_ecr_repository.backend.repository_url}:latest"
      image_repository_type = "ECR"
      
      image_configuration {
        port = "5000"
        runtime_environment_variables = {
          DATABASE_URL = "postgresql://${aws_db_instance.postgres.username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
          PORT         = "5000"
          NODE_ENV     = "production"
        }
      }
    }
  }
}

# 3. React Frontend Static Website Hosting (Amazon S3 & CloudFront)
resource "aws_s3_bucket" "frontend" {
  bucket = "pulse-uptime-monitor-frontend"
}

resource "aws_s3_bucket_website_configuration" "frontend_site" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
}

resource "aws_cloudfront_distribution" "cdn" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-Frontend"
  }

  enabled             = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-Frontend"

    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```
