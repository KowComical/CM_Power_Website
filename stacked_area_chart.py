import streamlit as st
import pandas as pd
import math
from streamlit_echarts import st_echarts
import json

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# Reading the dictionary from the text file
with open('./data/colors.txt', 'r') as file:
    COLORS = json.load(file)


def main():
    df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_area_option(df_7mean)
    
    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")
    
    st.sidebar.subheader("Legend: Energy Types")
    for energy_type, color in COLORS.items():
        st.sidebar.markdown(f"<span style='color: {color};'>■</span> {energy_type.capitalize()}", unsafe_allow_html=True)


@st.cache_data
def data_read():
    df_7mean = pd.read_csv('./data/data_for_stacked_area_chart.csv')
    df_7mean['percentage'] = round(df_7mean['percentage'],2)

    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df_7mean


def generate_grid_area_option(df_7mean):
    countries = df_7mean['country'].unique().tolist()
    energy_types = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other']

    COLS = 4
    ROWS = int(math.ceil(len(countries) / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 92 / ROWS

    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 200  # 根据需要进行调整

    WIDTH_ADJUSTMENT = 0.8
    HEIGHT_ADJUSTMENT = 1.0

    option = {
        "title": [{
            "text": "Power Generation Distribution by Source for Key Countries (TWh)",
            "left": "center",
            "top": "0%"
        }],
        "tooltip": {
            "trigger": "axis"
        },
              "legend": {
          "data": energy_types,
          "orient": "horizontal",
          "left": 'center',
          "top": 65,
          "icon": "circle",  # This will give a filled circle symbol
          "itemWidth": 12,  # Controls the width of the circle
          "itemHeight": 12,  # Controls the height of the circle
          "borderColor": "#333",  # Border color, here it's a dark gray
          "borderWidth": 1,  # Width of the border
          "borderRadius": 4,  # Rounded corners, adjust for desired roundness
          "padding": 10,  # Padding around the legend items
          "backgroundColor": "#f4f4f4",  # Light gray background for the legend
          "textStyle": {
              "fontSize": 16,
              "color": "#333"  # Font color matching the border color
          }
      },
        "xAxis": [],
        "yAxis": [],
        "grid": [],
        "series": []
    }


    # Grid, xAxis, and yAxis configurations remain the same
    for idx, country in enumerate(countries):
        country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
        country_dates = country_data['date'].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()

        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 10}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 4 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        option["xAxis"].append({
            "gridIndex": idx,
            "type": "category",
            "data": country_dates
        })

        option["yAxis"].append({
            "gridIndex": idx,
            "type": "value",
            "min": 0,
            "max": 100,
            "name": country,
            "nameTextStyle": {
                "fontSize": 14,
                "fontWeight": "bold",
                "padding": [0, 0, 0, 100]
            }
        })

    # New nested structure for series creation
    for energy_type in energy_types:
        for idx, country in enumerate(countries):
            country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
            series_data = country_data[country_data['type'] == energy_type]['percentage'].tolist()

            if len(series_data) == len(option["xAxis"][idx]["data"]):  # Ensure data alignment
                option["series"].append({
                    "name": energy_type,
                    "type": "line",
                    "stack": country,  # Unique stack label based on country name
                    "areaStyle": {"color": COLORS.get(energy_type)},
                    "itemStyle": {"color": COLORS.get(energy_type)},
                    "xAxisIndex": idx,
                    "yAxisIndex": idx,
                    "data": series_data
                })

    return option, ROWS_PER_GRID, PLOT_HEIGHT


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
