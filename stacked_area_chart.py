import streamlit as st
import pandas as pd
import math
from streamlit_echarts import st_echarts
import json
import base64

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


categories = {
        'Fossil': ['coal', 'gas', 'oil'],
        'Nuclear': ['nuclear'],
        'Renewables': ['solar', 'wind', 'other', 'hydro']
    }


def main():
    add_logo("./data/logo_edited.png")
    

    # 添加一个选择排序方式的功能
    categories = {
    'Fossil': ['coal', 'gas', 'oil'],
    'Nuclear': ['nuclear'],
    'Renewables': ['solar', 'wind', 'other', 'hydro']}
    
    captions = [', '.join([item.title() for item in items]) for items in categories.values()]
    
    selected_category = st.sidebar.radio(
    'Sort Countries by Energy Category:',
    list(categories.keys()),
    captions=captions
    )

    df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_area_option(df_7mean, selected_category)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")


def add_logo(image_path):
    # Open the image file
    with open(image_path, "rb") as img_file:
        # Encode the image as Base64
        b64_string = base64.b64encode(img_file.read()).decode()

    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;  /* Set width to 80% of the sidebar, height scales automatically */
                padding-top: 40px;  /* Adjust based on your image's height */
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )

@st.cache(ttl=60*60*24 + 10*60)  # 24 hours + 10 minutes
def data_read():
    df_7mean = pd.read_csv('./data/data_for_stacked_area_chart.csv')

    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df_7mean

@st.cache(ttl=60*60*24 + 10*60)  # 24 hours + 10 minutes
def generate_grid_area_option(df_7mean, selected_category):

    # Filter the dataframe for the last year only
    last_year = df_7mean['date'].max().year
    last_year_data = df_7mean[df_7mean['date'].dt.year == last_year]

    # Group by country and type, then sum the percentages
    summed_df = last_year_data.groupby(['country', 'type'])['percentage'].sum().reset_index()
    
    # Filter by the selected category
    filtered_df = summed_df[summed_df['type'].isin(categories[selected_category])]
    
    # Now, group by country and compute the mean percentage
    average_percentages = filtered_df.groupby('country')['percentage'].mean()
    
    # Sort the countries by the average percentage in descending order
    sorted_countries = average_percentages.sort_values(ascending=False).index.tolist()
    
    energy_types = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other']

    COLS = 4
    ROWS = int(math.ceil(len(sorted_countries) / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 92 / ROWS

    ROWS_PER_GRID = math.ceil(len(sorted_countries) / COLS)
    PLOT_HEIGHT = 200  # 根据需要进行调整

    WIDTH_ADJUSTMENT = 0.8
    HEIGHT_ADJUSTMENT = 1.0

    option = {
        "title": [{
            "text": "Power Generation Distribution by Source for Key Countries (%)",
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
            "top": 50,
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
        "series": [],
        "graphic": [],
    }


    

    # Grid, xAxis, and yAxis configurations remain the same
    for idx, country in enumerate(sorted_countries):
        country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
        country_dates = country_data['date'].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()

        # Compute the ratio sum for the selected category for the country
        category_data = country_data[country_data['type'].isin(categories[selected_category])]
        ratio_sum = category_data['percentage'].sum()
        ratio_sum_str = f"{ratio_sum:.2f}%"


        option["graphic"].append({
            "type": "text",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT + WIDTH/2 - 6}%",  # Centered horizontally
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 8}%",  # At the top of the grid
            "z": 100,  # Place it above other elements
            "style": {
                "text": f"{country} - {selected_category} {ratio_sum_str}",
                "fontSize": 14,
                "fontWeight": "bold",
                "textAlign": "center"  # Center align text
            }
        })


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
            # "name": f"{country} - {selected_category} {ratio_sum_str}",
            "nameTextStyle": {
                "fontSize": 14,
                "fontWeight": "bold",
                "padding": [0, 0, 0, 100]
            }
        })
      
    # New nested structure for series creation
    for energy_type in energy_types:
        for idx, country in enumerate(sorted_countries):
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
