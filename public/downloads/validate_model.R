# craniocalc external validation script
# -------------------------------------------------------------------------
# Computes aggregate performance metrics for a binary-outcome prediction
# model on a local cohort. Only summary statistics are written out; no
# patient-level data leaves your machine.
#
# Input: a CSV with two columns
#   observed  - the outcome, coded 0/1
#   predicted - the model's predicted probability, between 0 and 1
#
# Usage (from a terminal):
#   Rscript validate_model.R my_predictions.csv "Site name"
# or in R:
#   source("validate_model.R"); validate_model("my_predictions.csv", "Site name")
#
# Output (in the working directory):
#   validation_results.json   aggregate metrics to send back
#   calibration_plot.png      binned calibration plot
#
# Requires base R only. If the pROC package is installed, DeLong confidence
# intervals are used for the AUC; otherwise the Hanley-McNeil method.
# -------------------------------------------------------------------------

validate_model <- function(path, site = "Unnamed site", bins = 10, min_cell = 5) {
  d <- utils::read.csv(path, stringsAsFactors = FALSE)
  names(d) <- tolower(trimws(names(d)))
  stopifnot("CSV needs columns 'observed' and 'predicted'" = all(c("observed", "predicted") %in% names(d)))

  d <- d[stats::complete.cases(d[, c("observed", "predicted")]), ]
  y <- as.integer(d$observed)
  p <- as.numeric(d$predicted)
  if (!all(y %in% c(0L, 1L))) stop("'observed' must be coded 0/1.")
  if (any(p < 0 | p > 1)) stop("'predicted' must be probabilities between 0 and 1.")

  n <- length(y); n1 <- sum(y); n0 <- n - n1
  if (n1 < 1 || n0 < 1) stop("Need at least one event and one non-event.")

  # Discrimination: AUC (rank-based) with 95% CI
  auc_rank <- function(y, p) {
    r <- rank(p)
    (sum(r[y == 1]) - n1 * (n1 + 1) / 2) / (n1 * n0)
  }
  auc <- auc_rank(y, p)
  ci_method <- "Hanley-McNeil"
  if (requireNamespace("pROC", quietly = TRUE)) {
    roc <- pROC::roc(y, p, quiet = TRUE, direction = "<", levels = c(0, 1))
    ci <- as.numeric(pROC::ci.auc(roc, method = "delong"))[c(1, 3)]
    ci_method <- "DeLong"
  } else {
    q1 <- auc / (2 - auc); q2 <- 2 * auc^2 / (1 + auc)
    se <- sqrt((auc * (1 - auc) + (n1 - 1) * (q1 - auc^2) + (n0 - 1) * (q2 - auc^2)) / (n1 * n0))
    ci <- c(max(0, auc - 1.96 * se), min(1, auc + 1.96 * se))
  }

  # Overall accuracy and calibration
  brier <- mean((p - y)^2)
  brier_ref <- mean((mean(y) - y)^2)           # Brier of predicting the site's event rate
  scaled_brier <- 1 - brier / brier_ref
  oe <- n1 / sum(p)                            # observed / expected events
  lp <- stats::qlogis(pmin(pmax(p, 1e-6), 1 - 1e-6))
  cal_int <- unname(stats::coef(stats::glm(y ~ offset(lp), family = stats::binomial()))[1])
  cal_slope <- unname(stats::coef(stats::glm(y ~ lp, family = stats::binomial()))[2])

  # Binned calibration (suppress bins smaller than min_cell to protect privacy)
  brk <- unique(stats::quantile(p, probs = seq(0, 1, length.out = bins + 1), type = 7))
  grp <- cut(p, breaks = brk, include.lowest = TRUE)
  tab <- data.frame(
    bin = levels(grp),
    n = as.vector(table(grp)),
    mean_predicted = as.vector(tapply(p, grp, mean)),
    observed_rate = as.vector(tapply(y, grp, mean))
  )
  tab <- tab[tab$n >= min_cell, ]

  grDevices::png("calibration_plot.png", width = 1400, height = 1400, res = 220)
  graphics::plot(tab$mean_predicted, tab$observed_rate, xlim = c(0, 1), ylim = c(0, 1), pch = 19,
                 col = "#5b3fa0", xlab = "Mean predicted probability", ylab = "Observed proportion",
                 main = paste0("Calibration: ", site), las = 1)
  graphics::abline(0, 1, lty = 2, col = "grey40")
  graphics::lines(stats::lowess(p, y, iter = 0), col = "#16232b")
  graphics::mtext(sprintf("AUC %.3f  |  slope %.2f  |  intercept %.2f", auc, cal_slope, cal_int), side = 3, line = 0.2, cex = 0.8)
  grDevices::dev.off()

  res <- list(
    site = site,
    generated = format(Sys.time(), "%Y-%m-%d %H:%M %Z"),
    n = n, events = n1, event_rate = round(n1 / n, 4),
    auc = round(auc, 4), auc_ci95 = round(ci, 4), auc_ci_method = ci_method,
    brier = round(brier, 4), scaled_brier = round(scaled_brier, 4),
    observed_expected_ratio = round(oe, 3),
    calibration_intercept = round(cal_int, 3), calibration_slope = round(cal_slope, 3),
    calibration_bins = tab,
    note = paste("Bins with fewer than", min_cell, "patients are suppressed.")
  )

  to_json <- function(x, indent = "") {
    nxt <- paste0(indent, "  ")
    if (is.data.frame(x)) {
      rows <- lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE]))
      return(to_json(rows, indent))
    }
    if (is.list(x)) {
      named <- !is.null(names(x))
      items <- vapply(seq_along(x), function(i) {
        val <- to_json(x[[i]], nxt)
        if (named) paste0(nxt, '"', names(x)[i], '": ', val) else paste0(nxt, val)
      }, character(1))
      open <- if (named) "{" else "["; close <- if (named) "}" else "]"
      return(paste0(open, "\n", paste(items, collapse = ",\n"), "\n", indent, close))
    }
    if (is.character(x) || is.factor(x)) {
      v <- paste0('"', gsub('"', '\\\\"', as.character(x)), '"')
    } else {
      v <- ifelse(is.na(x), "null", format(x, scientific = FALSE, trim = TRUE))
    }
    if (length(v) == 1) v else paste0("[", paste(v, collapse = ", "), "]")
  }
  writeLines(to_json(res), "validation_results.json")

  cat(sprintf("\n%s: n = %d, events = %d (%.1f%%)\n", site, n, n1, 100 * n1 / n))
  cat(sprintf("AUC %.3f (95%% CI %.3f to %.3f, %s)\n", auc, ci[1], ci[2], ci_method))
  cat(sprintf("Brier %.4f (scaled %.3f) | O:E %.2f | calibration intercept %.2f, slope %.2f\n",
              brier, scaled_brier, oe, cal_int, cal_slope))
  cat("Wrote validation_results.json and calibration_plot.png\n")
  invisible(res)
}

if (!interactive()) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 1) {
    cat("Usage: Rscript validate_model.R predictions.csv [\"Site name\"]\n")
    quit(status = 1)
  }
  validate_model(args[1], if (length(args) > 1) args[2] else "Unnamed site")
}
